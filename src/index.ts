import { app } from './api/server';
import { configManager } from './config/config_manager';
import { UniversalLLMAdapter } from './llm/universal_adapter';
import { RiskEngine } from './security/risk_engine';
import { PathValidator } from './security/path_validator';
import { SSHExecutor } from './execution/ssh_client';
import { SandboxRuntime } from './execution/sandbox';
import { TaskOrchestrator } from './services/orchestrator';

async function bootstrap() {
  try {
    const cfg = configManager.getRawSettings();

    const llm = new UniversalLLMAdapter(cfg.API_KEY, cfg.PRIMARY_LLM, cfg.BASE_URL, cfg.MODEL_NAME);
    const riskEngine = new RiskEngine({ maxScoreAutoApprove: 40, maxScoreRequireHITL: 70 });
    const pathValidator = new PathValidator(cfg.SANDBOX_ROOT);
    const ssh = new SSHExecutor(cfg.SSH_HOST, cfg.SSH_PORT, cfg.SSH_USER, cfg.SSH_KEY_PATH);
    const sandbox = new SandboxRuntime(ssh, pathValidator, pathValidator['isWindows']);

    const orchestrator = new TaskOrchestrator(llm, riskEngine, sandbox);

    // Register orchestrator into ConfigManager for hot-reload
    configManager.setOrchestrator(orchestrator);

    // Register into Fastify for route access
    app.decorate('orchestrator', orchestrator);
    app.decorate('configManager', configManager);

    await app.listen({ port: cfg.PORT, host: cfg.HOST });
    app.log.info(`Autonomous OS Agent 2.0 running at http://${cfg.HOST}:${cfg.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();
