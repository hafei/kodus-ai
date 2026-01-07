import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { authService } from '../../services/auth.service.js';
import { telemetryService } from '../../services/telemetry.service.js';

interface LoginOptions {
  email?: string;
  password?: string;
}

export async function loginAction(options: LoginOptions): Promise<void> {
  const spinner = ora();

  try {
    const isAuthenticated = await authService.isAuthenticated();
    
    if (isAuthenticated && !options.email) {
      const credentials = await authService.getCredentials();
      console.log(chalk.yellow(`\nAlready logged in as ${credentials?.user.email}`));
      
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Do you want to login with a different account?',
          default: false,
        },
      ]);

      if (!confirm) {
        return;
      }
    }

    let email = options.email;
    let password = options.password;

    if (!email || !password) {
      const answers = await inquirer.prompt([
        ...(!email ? [{
          type: 'input',
          name: 'email',
          message: 'Email:',
          validate: (input: string) => {
            if (!input || !input.includes('@')) {
              return 'Please enter a valid email';
            }
            return true;
          },
        }] : []),
        ...(!password ? [{
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
        }] : []),
      ]);

      email = email || answers.email;
      password = password || answers.password;
    }

    spinner.start(chalk.blue('Logging in...'));

    await authService.login(email!, password!);

    spinner.succeed(chalk.green(`Logged in as ${email}`));

    // Telemetry and debug info are best-effort and should not fail the login command
    try {
      // Get credentials for debug output and telemetry
      const creds = await authService.getCredentials();

      // Track successful login
      telemetryService.track('auth_login_success');

      // Identify user for telemetry
      if (creds) {
        await telemetryService.identify(creds.user.id, {
          email: creds.user.email,
          orgs: creds.user.orgs,
        });

        if (process.env.KODUS_VERBOSE) {
          console.log(chalk.dim('\nDebug - Stored credentials:'));
          console.log(chalk.dim(JSON.stringify(creds, null, 2)));
        }
      }
    } catch (postLoginError) {
      // Silently ignore telemetry or credential errors to not disrupt the user flow
      if (process.env.KODUS_VERBOSE) {
        console.log(chalk.dim('\nDebug - Post-login operations failed:'));
        console.log(chalk.dim(postLoginError instanceof Error ? postLoginError.message : String(postLoginError)));
      }
    }

  } catch (error) {
    spinner.fail(chalk.red('Login failed'));

    // Track failed login
    telemetryService.track('auth_login_failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    process.exit(1);
  }
}

