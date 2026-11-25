export function main(): void {
  process.stdout.write('reengine-cli 0.1.0\n');
}

const argv1 = process.argv[1] ?? '';
if (import.meta.url === `file:///${argv1.replace(/\\/g, '/')}`) {
  main();
}
