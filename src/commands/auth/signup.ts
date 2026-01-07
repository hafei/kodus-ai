import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { authService } from '../../services/auth.service.js';
import { telemetryService } from '../../services/telemetry.service.js';

export async function signupAction(): Promise<void> {
  const spinner = ora();

  try {
    console.log(chalk.bold('\nCreate your Kodus account\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: 'Email:',
        validate: (input: string) => {
          if (!input || !input.includes('@')) {
            return 'Please enter a valid email';
          }
          return true;
        },
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password:',
        mask: '*',
        validate: (input: string) => {
          if (!input || input.length < 6) {
            return 'Password must be at least 6 characters';
          }
          return true;
        },
      },
      {
        type: 'password',
        name: 'confirmPassword',
        message: 'Confirm password:',
        mask: '*',
        validate: (input: string, allAnswers) => {
          if (input !== allAnswers?.password) {
            return 'Passwords do not match';
          }
          return true;
        },
      },
    ]);

    spinner.start(chalk.blue('Creating account...'));

    await authService.signup(answers.email, answers.password);

    spinner.succeed(chalk.green('Account created!'));
    console.log(chalk.dim('\nPlease check your email to verify your account.'));

    // Track successful signup
    telemetryService.track('auth_signup_success');

  } catch (error) {
    spinner.fail(chalk.red('Signup failed'));

    // Track failed signup
    try {
      await telemetryService.track('auth_signup_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } catch (telemetryError) {
      // Silently ignore telemetry errors to not hide the original error
      if (process.env.KODUS_VERBOSE) {
        console.log(chalk.dim('Debug - Telemetry failed'));
      }
    }

    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    process.exit(1);
  }
}

