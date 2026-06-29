import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';

/**
 * Returns the content of `filePath` as it exists in the current Git HEAD,
 * or `null` if the file is not inside a Git repository or has no committed
 * version yet (e.g. brand new file).
 */
export async function getPreviousVersion(filePath: string): Promise<string | null> {
  const dir = path.dirname(filePath);

  let git: SimpleGit;
  try {
    git = simpleGit(dir);
  } catch {
    return null;
  }

  try {
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return null;
    }
  } catch {
    return null;
  }

  // Resolve the repository root so we can compute a repo-relative path,
  // which is what `git show HEAD:<path>` expects.
  let repoRoot: string;
  try {
    repoRoot = (await git.revparse(['--show-toplevel'])).trim();
  } catch {
    return null;
  }

  const relativePath = path.relative(repoRoot, filePath).split(path.sep).join('/');

  try {
    // `git show HEAD:relative/path` prints the committed version to stdout.
    return await git.show([`HEAD:${relativePath}`]);
  } catch {
    // File is untracked or did not exist in HEAD.
    return null;
  }
}

/**
 * Whether the given file lives inside a Git repository.
 */
export async function isInGitRepo(filePath: string): Promise<boolean> {
  try {
    const git = simpleGit(path.dirname(filePath));
    return await git.checkIsRepo();
  } catch {
    return false;
  }
}
