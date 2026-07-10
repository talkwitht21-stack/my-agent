"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./api/server");
const config_manager_1 = require("./config/config_manager");
const universal_adapter_1 = require("./llm/universal_adapter");
const risk_engine_1 = require("./security/risk_engine");
const path_validator_1 = require("./security/path_validator");
const ssh_client_1 = require("./execution/ssh_client");
const sandbox_1 = require("./execution/sandbox");
const orchestrator_1 = require("./services/orchestrator");
async function bootstrap() {
    try {
        const cfg = config_manager_1.configManager.getRawSettings();
        const llm = new universal_adapter_1.UniversalLLMAdapter(cfg.API_KEY, cfg.PRIMARY_LLM, cfg.BASE_URL, cfg.MODEL_NAME);
        const riskEngine = new risk_engine_1.RiskEngine({ maxScoreAutoApprove: 40, maxScoreRequireHITL: 70 });
        const pathValidator = new path_validator_1.PathValidator(cfg.SANDBOX_ROOT);
        const ssh = new ssh_client_1.SSHExecutor(cfg.SSH_HOST, cfg.SSH_PORT, cfg.SSH_USER, cfg.SSH_KEY_PATH);
        const sandbox = new sandbox_1.SandboxRuntime(ssh, pathValidator, pathValidator['isWindows']);
        const orchestrator = new orchestrator_1.TaskOrchestrator(llm, riskEngine, sandbox);
        // Register orchestrator into ConfigManager for hot-reload
        config_manager_1.configManager.setOrchestrator(orchestrator);
        // Register into Fastify for route access
        server_1.app.decorate('orchestrator', orchestrator);
        server_1.app.decorate('configManager', config_manager_1.configManager);
        await server_1.app.listen({ port: cfg.PORT, host: cfg.HOST });
        server_1.app.log.info(`Autonomous OS Agent 2.0 running at http://${cfg.HOST}:${cfg.PORT}`);
    }
    catch (err) {
        server_1.app.log.error(err);
        process.exit(1);
    }
}
bootstrap();
