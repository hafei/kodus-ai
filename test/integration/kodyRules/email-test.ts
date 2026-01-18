import { sendKodyRulesNotification } from '@libs/common/utils/email/sendMail';

// Teste simples para envio real de email
export async function testEmailSend() {
    // Verificar se as variáveis de ambiente estão configuradas
    if (!process.env.API_CUSTOMERIO_APP_API_TOKEN) {
        console.log(
            '❌ Configure API_CUSTOMERIO_APP_API_TOKEN nas variaveis de ambiente',
        );
        return;
    }

    const testEmail =
        process.env.API_CUSTOMERIO_TEST_EMAIL || 'gabriel@kodus.io';
    const testOrganization =
        process.env.API_CUSTOMERIO_TEST_ORG || 'Kodus Test Organization';

    console.log('📧 Enviando email de teste...');
    console.log('📬 Destinatario:', testEmail);
    console.log('🏢 Organizacao:', testOrganization);

    const users = [
        {
            email: testEmail,
            name: 'Gabriel Malinosqui',
        },
    ];

    const testRules = [
        'Todos os métodos públicos devem ter testes unitários',
        'Endpoints devem ter documentação Swagger',
        'Usar try-catch em operações async',
    ];

    try {
        const results = await sendKodyRulesNotification(
            users,
            testRules,
            testOrganization,
        );

        console.log('📊 Resultado:', results);

        const failures = results.filter(
            (result) => result.status === 'rejected',
        );
        if (failures.length > 0) {
            console.error('❌ Falha no envio de email:', failures);
            throw new Error('Customer.io email failures');
        }

        console.log('✅ Email enviado com sucesso!');
        console.log(`📧 Verifique a caixa de entrada de ${testEmail}`);

        return results;
    } catch (error) {
        console.error('❌ Erro ao enviar email:', error);
        throw error;
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    testEmailSend()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
