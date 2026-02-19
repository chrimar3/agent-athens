import { spawn } from 'bun';
import { join } from 'path';

/**
 * Result of subprocess execution
 */
export interface SubprocessResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
  timedOut?: boolean;
}

/**
 * Run a subprocess with timeout handling
 *
 * @param command - Command array [executable, ...args]
 * @param timeout_ms - Timeout in milliseconds (default: 120000 = 2 minutes)
 * @param cwd - Working directory (default: project root)
 * @returns SubprocessResult with output and exit code
 */
export async function runSubprocess(
  command: string[],
  timeout_ms: number = 120000,
  cwd: string = join(import.meta.dir, '../..')
): Promise<SubprocessResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Spawn subprocess
    const proc = spawn({
      cmd: command,
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Set timeout to kill subprocess
    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeout_ms);

    // Collect stdout
    (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of proc.stdout) {
        stdout += decoder.decode(chunk);
      }
    })();

    // Collect stderr
    (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of proc.stderr) {
        stderr += decoder.decode(chunk);
      }
    })();

    // Wait for process to exit
    proc.exited.then((exitCode) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        resolve({
          success: false,
          stdout,
          stderr,
          exitCode: null,
          error: `Process timed out after ${timeout_ms}ms`,
          timedOut: true,
        });
      } else if (exitCode === 0) {
        resolve({
          success: true,
          stdout,
          stderr,
          exitCode,
        });
      } else {
        resolve({
          success: false,
          stdout,
          stderr,
          exitCode,
          error: `Process exited with code ${exitCode}`,
        });
      }
    }).catch((error) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        stdout,
        stderr,
        exitCode: null,
        error: `Process error: ${error.message}`,
      });
    });
  });
}

/**
 * Run subprocess with retry logic and exponential backoff
 *
 * @param command - Command array [executable, ...args]
 * @param timeout_ms - Timeout in milliseconds
 * @param retry_count - Number of retries (default: 3)
 * @param cwd - Working directory
 * @returns SubprocessResult from successful run or last failure
 */
export async function runWithRetry(
  command: string[],
  timeout_ms: number,
  retry_count: number = 3,
  cwd?: string
): Promise<SubprocessResult> {
  let lastResult: SubprocessResult | null = null;

  for (let attempt = 0; attempt <= retry_count; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s, 8s
      const delayMs = Math.pow(2, attempt) * 1000;
      console.log(`⏳ Retry ${attempt}/${retry_count} after ${delayMs}ms delay...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const result = await runSubprocess(command, timeout_ms, cwd);
    lastResult = result;

    if (result.success) {
      if (attempt > 0) {
        console.log(`✅ Succeeded on retry ${attempt}/${retry_count}`);
      }
      return result;
    }

    console.error(`❌ Attempt ${attempt + 1}/${retry_count + 1} failed:`, result.error);
  }

  return lastResult!;
}

/**
 * Run a Python script with timeout and retry
 *
 * @param script - Path to Python script (relative to project root)
 * @param args - Script arguments
 * @param timeout_ms - Timeout in milliseconds (default: 120000)
 * @param retry_count - Number of retries (default: 3)
 * @returns SubprocessResult
 */
export async function runPythonScript(
  script: string,
  args: string[] = [],
  timeout_ms: number = 120000,
  retry_count: number = 3
): Promise<SubprocessResult> {
  const command = ['python3', script, ...args];
  console.log(`🐍 Running Python script: ${command.join(' ')}`);
  return runWithRetry(command, timeout_ms, retry_count);
}

/**
 * Run a Bun script with timeout and retry
 *
 * @param script - Path to TypeScript/JavaScript script (relative to project root)
 * @param args - Script arguments
 * @param timeout_ms - Timeout in milliseconds (default: 60000)
 * @param retry_count - Number of retries (default: 2)
 * @returns SubprocessResult
 */
export async function runBunScript(
  script: string,
  args: string[] = [],
  timeout_ms: number = 60000,
  retry_count: number = 2
): Promise<SubprocessResult> {
  const command = ['bun', 'run', script, ...args];
  console.log(`🥟 Running Bun script: ${command.join(' ')}`);
  return runWithRetry(command, timeout_ms, retry_count);
}
