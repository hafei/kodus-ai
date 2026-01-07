import { Command } from 'commander';
import chalk from 'chalk';
import { telemetryService } from '../services/telemetry.service.js';

export const telemetryCommand = new Command('telemetry')
  .description('Manage telemetry settings')
  .addCommand(
    new Command('enable')
      .description('Enable anonymous telemetry')
      .action(async () => {
        try {
          await telemetryService.enable();
          console.log(chalk.green('✓ Telemetry enabled'));
          console.log('');
          console.log(chalk.dim('Anonymous usage data will be collected to improve Kodus.'));
          console.log(chalk.dim('We never collect sensitive data (code, file names, tokens, etc).'));
          console.log('');
        } catch (error) {
          console.error(chalk.red('Failed to enable telemetry'));
          if (error instanceof Error) {
            console.error(chalk.red(error.message));
          }
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('disable')
      .description('Disable telemetry (opt-out)')
      .action(async () => {
        try {
          await telemetryService.disable();
          console.log(chalk.green('✓ Telemetry disabled'));
          console.log('');
          console.log(chalk.dim('No anonymous usage data will be collected.'));
          console.log('');
        } catch (error) {
          console.error(chalk.red('Failed to disable telemetry'));
          if (error instanceof Error) {
            console.error(chalk.red(error.message));
          }
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('status')
      .description('Check telemetry status')
      .action(async () => {
        try {
          const enabled = await telemetryService.status();

          console.log('');
          console.log(chalk.bold('Telemetry Status'));
          console.log(chalk.dim('─'.repeat(50)));
          console.log('');

          if (enabled) {
            console.log(chalk.green('● Enabled'));
            console.log('');
            console.log(chalk.dim('Anonymous usage data is being collected.'));
            console.log(chalk.dim('To opt-out, run: ') + chalk.cyan('kodus telemetry disable'));
          } else {
            console.log(chalk.yellow('○ Disabled'));
            console.log('');
            console.log(chalk.dim('Telemetry is disabled. No data is being collected.'));
            console.log(chalk.dim('To enable, run: ') + chalk.cyan('kodus telemetry enable'));
          }

          console.log('');
          console.log(chalk.dim('Learn more: https://docs.kodus.io/telemetry'));
          console.log('');
        } catch (error) {
          console.error(chalk.red('Failed to check telemetry status'));
          if (error instanceof Error) {
            console.error(chalk.red(error.message));
          }
          process.exit(1);
        }
      })
  );
