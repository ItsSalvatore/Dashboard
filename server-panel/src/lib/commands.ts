import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

type RunCommandOptions = {
  timeout?: number;
  maxBuffer?: number;
};

export async function runCommand(
  command: string,
  args: string[] = [],
  options: RunCommandOptions = {}
) {
  return execFileAsync(command, args, {
    timeout: options.timeout ?? 15000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024,
  });
}

export async function runFirstSuccessful(
  attempts: Array<{ command: string; args?: string[] }>,
  options: RunCommandOptions = {}
) {
  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      return await runCommand(attempt.command, attempt.args ?? [], options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("No command attempts provided");
}
