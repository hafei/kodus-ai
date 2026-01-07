import { simpleGit, SimpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import type { FileDiff, FileContent } from '../types/index.js';

class GitService {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit();
  }

  async isGitRepository(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  async getGitRoot(): Promise<string> {
    return this.git.revparse(['--show-toplevel']);
  }

  async getRemoteUrl(remote = 'origin'): Promise<string | null> {
    try {
      const remotes = await this.git.getRemotes(true);
      const found = remotes.find((r) => r.name === remote);
      return found?.refs?.fetch || null;
    } catch {
      return null;
    }
  }

  async extractOrgRepo(): Promise<{ org: string; repo: string } | null> {
    const remoteUrl = await this.getRemoteUrl();
    if (!remoteUrl) return null;

    const patterns = [
      /github\.com[:/]([^/]+)\/([^/.]+)/,
      /gitlab\.com[:/]([^/]+)\/([^/.]+)/,
      /bitbucket\.org[:/]([^/]+)\/([^/.]+)/,
    ];

    for (const pattern of patterns) {
      const match = remoteUrl.match(pattern);
      if (match) {
        return { org: match[1], repo: match[2] };
      }
    }

    return null;
  }

  async getWorkingTreeDiff(): Promise<string> {
    const staged = await this.git.diff(['--cached']);
    const unstaged = await this.git.diff();
    return `${staged}\n${unstaged}`.trim();
  }

  async getStagedDiff(): Promise<string> {
    return this.git.diff(['--cached']);
  }

  async getDiffForCommit(commitSha: string): Promise<string> {
    return this.git.diff([`${commitSha}^`, commitSha]);
  }

  async getDiffForBranch(branchName: string): Promise<string> {
    // Compara branch atual contra branch especificado (ex: main)
    // Usa three-dot notation pra pegar diff desde o merge base
    return this.git.diff([`${branchName}...HEAD`]);
  }

  async getDiffForFiles(files: string[]): Promise<string> {
    const diffs: string[] = [];
    
    for (const file of files) {
      const stagedDiff = await this.git.diff(['--cached', '--', file]);
      const unstagedDiff = await this.git.diff(['--', file]);
      
      if (stagedDiff) diffs.push(stagedDiff);
      if (unstagedDiff) diffs.push(unstagedDiff);
    }

    return diffs.join('\n').trim();
  }

  async getModifiedFiles(): Promise<FileDiff[]> {
    const status = await this.git.status();
    const files: FileDiff[] = [];

    const processFile = async (file: string, gitStatus: string): Promise<FileDiff> => {
      let status: FileDiff['status'] = 'modified';
      
      if (gitStatus === 'A' || gitStatus === '?') status = 'added';
      else if (gitStatus === 'D') status = 'deleted';
      else if (gitStatus === 'R') status = 'renamed';

      const diff = await this.git.diff(['--', file]);
      const lines = diff.split('\n');
      
      let additions = 0;
      let deletions = 0;
      
      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) additions++;
        if (line.startsWith('-') && !line.startsWith('---')) deletions++;
      }

      return { file, status, additions, deletions, diff };
    };

    for (const file of status.staged) {
      files.push(await processFile(file, 'M'));
    }

    for (const file of status.modified) {
      if (!files.find((f) => f.file === file)) {
        files.push(await processFile(file, 'M'));
      }
    }

    for (const file of status.not_added) {
      files.push(await processFile(file, 'A'));
    }

    return files;
  }

  async getFullFileContents(explicitFiles?: string[], options?: {
    staged?: boolean;
    commit?: string;
    branch?: string;
  }): Promise<FileContent[]> {
    // 1. Identificar arquivos a processar
    let filesToRead: string[];

    // Fetch modified files once upfront to avoid N+1 performance issue
    const allModifiedFiles = await this.getModifiedFiles();
    const modifiedFilesMap = new Map(allModifiedFiles.map(f => [f.file, f]));

    if (explicitFiles && explicitFiles.length > 0) {
      // Arquivos explícitos fornecidos
      filesToRead = explicitFiles;
    } else {
      // Detectar automaticamente via getModifiedFiles()
      filesToRead = allModifiedFiles.map(f => f.file);
    }

    // 2. Para cada arquivo, ler conteúdo E diff
    const fileContents: FileContent[] = [];

    for (const filePath of filesToRead) {
      try {
        // Determinar status do arquivo
        const fileInfo = modifiedFilesMap.get(filePath);
        const status = fileInfo?.status || 'modified';

        // Pular arquivos deletados (não tem conteúdo)
        if (status === 'deleted') continue;

        // Pegar diff específico desse arquivo
        let fileDiff: string;
        if (options?.branch) {
          // Diff entre branch e HEAD
          fileDiff = await this.git.diff([`${options.branch}...HEAD`, '--', filePath]);
        } else if (options?.commit) {
          // Diff do commit específico
          fileDiff = await this.git.diff([`${options.commit}^`, options.commit, '--', filePath]);
        } else if (options?.staged) {
          // Diff staged apenas
          fileDiff = await this.git.diff(['--cached', '--', filePath]);
        } else {
          // Diff completo (staged + unstaged)
          const stagedDiff = await this.git.diff(['--cached', '--', filePath]);
          const unstagedDiff = await this.git.diff(['--', filePath]);
          fileDiff = `${stagedDiff}\n${unstagedDiff}`.trim();
        }

        // Ler conteúdo do arquivo
        let content: string;

        if (options?.commit) {
          // Ler do commit específico
          content = await this.git.show([`${options.commit}:${filePath}`]);
        } else {
          // Ler do working tree (fs.readFile)
          // Para branch comparison, lê a versão atual (HEAD)
          const fullPath = path.resolve(filePath);
          content = await fs.readFile(fullPath, 'utf-8');
        }

        fileContents.push({
          path: filePath,
          content,
          status,
          diff: fileDiff,
        });
      } catch (error) {
        // Arquivo pode ser binário ou inacessível - pular silenciosamente
        continue;
      }
    }

    return fileContents;
  }

  async getCurrentBranch(): Promise<string> {
    return this.git.revparse(['--abbrev-ref', 'HEAD']);
  }

  async getHeadCommit(): Promise<string> {
    return this.git.revparse(['HEAD']);
  }
}

export const gitService = new GitService();

