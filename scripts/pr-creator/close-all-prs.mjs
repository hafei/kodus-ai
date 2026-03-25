import { execSync } from 'child_process';

const repos = [
    'Wellington01/sentry-greptile',
    'Wellington01/grafana-greptile',
    'Wellington01/discourse-greptile',
    'Wellington01/cal.com-greptile',
    'Wellington01/keycloak-greptile'
];

async function main() {
    console.log("🧹 Iniciando limpeza de Pull Requests abertos...\n");

    for (const repo of repos) {
        console.log(`🔍 Verificando PRs abertos em ${repo}...`);
        try {
            // Buscar PRs abertos
            const output = execSync(`gh pr list -R ${repo} --state open --json number -q '.[].number'`, { encoding: 'utf-8' }).trim();
            
            if (!output) {
                console.log(`   ✅ Nenhum PR aberto encontrado.`);
                continue;
            }

            const prNumbers = output.split('\n').filter(Boolean);
            console.log(`   🗑️ Encontrados ${prNumbers.length} PRs abertos. Fechando...`);

            for (const number of prNumbers) {
                try {
                    execSync(`gh pr close ${number} -R ${repo} --delete-branch=false`, { stdio: 'pipe' });
                    console.log(`      ✓ PR #${number} fechado com sucesso.`);
                } catch (closeErr) {
                    console.error(`      ❌ Erro ao fechar PR #${number}`);
                }
            }
        } catch (e) {
            console.error(`   ❌ Erro ao listar PRs em ${repo}:`, e.message);
        }
    }

    console.log("\n✨ Limpeza concluída!");
}

main();
