import type {
  AuthResponse,
  RemoteConfig,
  ReviewConfig,
  ReviewResult,
  TrialReviewResult,
  TrialStatus,
} from '../../types/index.js';
import { ApiError } from '../../types/index.js';
import type { IKodusApi, IAuthApi, IReviewApi, IConfigApi, ITrialApi } from './api.interface.js';

const API_BASE_URL = process.env.KODUS_API_URL || 'https://api.kodus.io';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Request failed' })) as { message?: string };
    const errorMessage = errorData.message || `Request failed with status ${response.status}`;

    if (process.env.KODUS_VERBOSE) {
      console.error('API Error:', { status: response.status, url, errorData });
    }

    throw new ApiError(response.status, errorMessage);
  }

  const json = await response.json() as any;

  // API retorna { data: {...}, statusCode, type }
  // Extrair apenas o .data se existir
  if (json && typeof json === 'object' && 'data' in json) {
    return json.data as T;
  }

  return json as T;
}

class RealAuthApi implements IAuthApi {
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await request<{ accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Mapear resposta da API para formato esperado pelo CLI
    return {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresIn: 3600, // Default: 1 hora
      user: {
        id: 'unknown', // API não retorna user info no login
        email,
        orgs: [],
      },
    };
  }

  async signup(email: string, password: string): Promise<AuthResponse> {
    // Signup não é permitido via CLI - só via app.kodus.io
    throw new Error('Signup is not available via CLI. Please sign up at https://app.kodus.io');
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  async logout(accessToken: string): Promise<void> {
    await request<void>('/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  async generateCIToken(accessToken: string): Promise<string> {
    const response = await request<{ token: string }>('/auth/ci-token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.token;
  }

  async verify(accessToken: string): Promise<{ valid: boolean; user?: any }> {
    // SECURITY NOTE: This performs basic client-side JWT validation without signature verification.
    // This is acceptable for a CLI client where:
    // 1. The token is securely stored locally and only accessed by the user
    // 2. The API validates the token signature on every request
    // 3. We only check format and expiration to avoid unnecessary API calls
    //
    // For production security, all authorization decisions MUST be made by the API
    // after validating the token signature.

    if (!accessToken || !accessToken.startsWith('eyJ')) {
      return { valid: false };
    }

    try {
      // Decode JWT payload (without signature validation)
      const parts = accessToken.split('.');
      if (parts.length !== 3) {
        return { valid: false };
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      // Check expiration
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return { valid: false };
      }

      return {
        valid: true,
        user: {
          id: payload.sub || 'unknown',
          email: payload.email || 'unknown',
          orgs: [],
        },
      };
    } catch (error) {
      if (process.env.KODUS_VERBOSE) {
        console.error('Token verification failed:', error);
      }
      return { valid: false };
    }
  }
}

class RealReviewApi implements IReviewApi {
  async analyze(diff: string, accessToken: string, config?: ReviewConfig): Promise<ReviewResult> {
    // SECURITY NOTE: We extract organizationId from JWT and send as teamId query param.
    // The backend MUST validate the JWT signature and verify that the authenticated user
    // has permission to access this team. The backend should NOT trust the teamId parameter
    // alone - it should cross-check it against the validated token claims.

    // Extract organizationId from JWT
    let teamId: string | undefined;
    try {
      const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
      teamId = payload.organizationId;
    } catch (error) {
      // Ignore if cannot decode
    }

    // Build URL with teamId query string
    const endpoint = teamId ? `/cli/review?teamId=${encodeURIComponent(teamId)}` : '/cli/review';

    return request<ReviewResult>(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ diff, config }),
    });
  }

  async trialAnalyze(diff: string, fingerprint: string): Promise<TrialReviewResult> {
    return request<TrialReviewResult>('/cli/trial/review', {
      method: 'POST',
      body: JSON.stringify({ diff, fingerprint }),
    });
  }
}

class RealConfigApi implements IConfigApi {
  async get(accessToken: string, org?: string, repo?: string): Promise<RemoteConfig> {
    const params = new URLSearchParams();
    if (org) params.set('org', org);
    if (repo) params.set('repo', repo);
    
    const query = params.toString() ? `?${params.toString()}` : '';
    
    return request<RemoteConfig>(`/cli/config${query}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }
}

class RealTrialApi implements ITrialApi {
  async getStatus(fingerprint: string): Promise<TrialStatus> {
    return request<TrialStatus>(`/cli/trial/status?fingerprint=${fingerprint}`);
  }
}

export class RealApi implements IKodusApi {
  auth: IAuthApi = new RealAuthApi();
  review: IReviewApi = new RealReviewApi();
  config: IConfigApi = new RealConfigApi();
  trial: ITrialApi = new RealTrialApi();
}

