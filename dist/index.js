"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./api/server");
const settings_1 = require("./config/settings");
const universal_adapter_1 = require("./llm/universal_adapter");
const risk_engine_1 = require("./security/risk_engine");
const path_validator_1 = require("./security/path_validator");
const ssh_client_1 = require("./execution/ssh_client");
const sandbox_1 = require("./execution/sandbox");
const orchestrator_1 = require("./services/orchestrator");
async function bootstrap() {
    try {
        const llm = new universal_adapter_1.UniversalLLMAdapter(settings_1.config.API_KEY, settings_1.config.PRIMARY_LLM, settings_1.config.BASE_URL, settings_1.config.MODEL_NAME);
        const riskEngine = new risk_engine_1.RiskEngine({ maxScoreAutoApprove: 40, maxScoreRequireHITL: 70 });
        const pathValidator = new path_validator_1.PathValidator(settings_1.config.SANDBOX_ROOT);
        const ssh = new ssh_client_1.SSHExecutor(settings_1.config.SSH_HOST, settings_1.config.SSH_PORT, settings_1.config.SSH_USER, settings_1.config.SSH_KEY_PATH);
        const sandbox = new sandbox_1.SandboxRuntime(ssh, pathValidator, pathValidator['isWindows']);
        const orchestrator = new orchestrator_1.TaskOrchestrator(llm, riskEngine, sandbox);
        server_1.app.decorate('orchestrator', orchestrator);
        await server_1.app.listen({ port: settings_1.config.PORT, host: settings_1.config.HOST });
        server_1.app.log.info(`Autonomous OS Agent 2.0 running at http://${settings_1.config.HOST}:${settings_1.config.PORT}`);
    }
    catch (err) {
        server_1.app.log.error(err);
        process.exit(1);
    }
}
bootstrap();
