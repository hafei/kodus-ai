import { api } from './api/index.js';
import { authService } from './auth.service.js';
import { gitService } from './git.service.js';
import { getTrialIdentifier } from '../utils/rate-limit.js';
import type { RemoteConfig, ReviewConfig, ReviewResult, TrialReviewResult } from '../types/index.js';

class ReviewService {
  async getConfig(org?: string, repo?: string): Promise<RemoteConfig> {
    const token = await authService.getValidToken();
    
    let effectiveOrg = org;
    let effectiveRepo = repo;

    if (!effectiveOrg || !effectiveRepo) {
      const detected = await gitService.extractOrgRepo();
      if (detected) {
        effectiveOrg = effectiveOrg || detected.org;
        effectiveRepo = effectiveRepo || detected.repo;
      }
    }

    return api.config.get(token, effectiveOrg, effectiveRepo);
  }

  async analyze(
    diff: string,
    config?: RemoteConfig,
    rulesOnly?: boolean,
    fast?: boolean,
    options?: { files?: string[]; staged?: boolean; commit?: string; branch?: string }
  ): Promise<ReviewResult> {
    const token = await authService.getValidToken();

    const reviewConfig: ReviewConfig | undefined = config
      ? {
          severity: config.severity,
          rules: config.rules,
          rulesOnly,
          fast,
        }
      : undefined;

    // Se não for modo fast, incluir arquivos completos
    if (reviewConfig && !fast) {
      reviewConfig.files = await gitService.getFullFileContents(
        options?.files,
        {
          staged: options?.staged,
          commit: options?.commit,
          branch: options?.branch,
        }
      );
    }

    return api.review.analyze(diff, token, reviewConfig);
  }

  async trialAnalyze(diff: string): Promise<TrialReviewResult> {
    const fingerprint = await getTrialIdentifier();
    return api.review.trialAnalyze(diff, fingerprint);
  }
}

export const reviewService = new ReviewService();

