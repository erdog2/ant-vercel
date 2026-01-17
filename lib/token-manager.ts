/**
 * Token Manager - Account rotation and token refresh
 */

export interface AccountToken {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expiry_timestamp: number;
    project_id?: string;
}

export interface Account {
    id: string;
    email: string;
    token: AccountToken;
    disabled?: boolean;
    proxy_disabled?: boolean;
    subscription_tier?: 'FREE' | 'PRO' | 'ULTRA';
}

// In-memory state
let accounts: Account[] = [];
let currentIndex = 0;
let lastRefreshTime = 0;

/**
 * Load accounts from environment variable
 */
export function loadAccounts(): Account[] {
    try {
        const accountsJson = process.env.ACCOUNTS_JSON || '[]';
        accounts = JSON.parse(accountsJson);

        // Filter out disabled accounts
        accounts = accounts.filter(acc => !acc.disabled && !acc.proxy_disabled);

        // Sort by subscription tier: ULTRA > PRO > FREE
        accounts.sort((a, b) => {
            const tierPriority = (tier?: string) => {
                switch (tier) {
                    case 'ULTRA': return 0;
                    case 'PRO': return 1;
                    case 'FREE': return 2;
                    default: return 3;
                }
            };
            return tierPriority(a.subscription_tier) - tierPriority(b.subscription_tier);
        });

        console.log(`[TokenManager] Loaded ${accounts.length} accounts`);
        return accounts;
    } catch (error) {
        console.error('[TokenManager] Failed to load accounts:', error);
        return [];
    }
}

/**
 * Get the next available token using round-robin rotation
 */
export async function getToken(): Promise<{ account: Account; token: string } | null> {
    // Reload accounts if empty or periodically (every 5 minutes)
    if (accounts.length === 0 || Date.now() - lastRefreshTime > 5 * 60 * 1000) {
        loadAccounts();
        lastRefreshTime = Date.now();
    }

    if (accounts.length === 0) {
        console.error('[TokenManager] No accounts available');
        return null;
    }

    // Get next account (round-robin)
    const account = accounts[currentIndex % accounts.length];
    currentIndex++;

    // Check if token needs refresh (within 5 minutes of expiry)
    const now = Math.floor(Date.now() / 1000);
    if (now >= account.token.expiry_timestamp - 300) {
        console.log(`[TokenManager] Token for ${account.email} is expiring, refreshing...`);
        const refreshed = await refreshToken(account);
        if (refreshed) {
            return { account, token: refreshed };
        }
        // If refresh failed, try next account
        return getToken();
    }

    return { account, token: account.token.access_token };
}

/**
 * Refresh an account's access token using the refresh token
 */
async function refreshToken(account: Account): Promise<string | null> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        console.error('[TokenManager] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
        return null;
    }

    try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: account.token.refresh_token,
                grant_type: 'refresh_token',
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error(`[TokenManager] Token refresh failed for ${account.email}:`, error);
            return null;
        }

        const data = await response.json();
        const now = Math.floor(Date.now() / 1000);

        // Update in-memory token
        account.token.access_token = data.access_token;
        account.token.expires_in = data.expires_in;
        account.token.expiry_timestamp = now + data.expires_in;

        console.log(`[TokenManager] Token refreshed for ${account.email}`);
        return data.access_token;
    } catch (error) {
        console.error(`[TokenManager] Token refresh error for ${account.email}:`, error);
        return null;
    }
}

/**
 * Get the number of available accounts
 */
export function getAccountCount(): number {
    if (accounts.length === 0) {
        loadAccounts();
    }
    return accounts.length;
}

/**
 * Get all accounts (for status display)
 */
export function getAccounts(): Account[] {
    if (accounts.length === 0) {
        loadAccounts();
    }
    return accounts.map(acc => ({
        ...acc,
        token: {
            ...acc.token,
            access_token: '***',  // Mask token
            refresh_token: '***', // Mask token
        },
    }));
}
