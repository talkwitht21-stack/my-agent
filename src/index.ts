import { app } from './api/server';
import { config } from './config/settings';
import { UniversalLLMAdapter } from './llm/universal_adapter';
import { RiskEngine } from './security/risk_engine';
import { PathValidator } from './security/path_validator';
import { SSHExecutor } from './execution/ssh_client';
import { SandboxRuntime } from './execution/sandbox';
import { TaskOrchestrator } from './services/orchestrator';

async function bootstrap() {
  try {
    const llm = new UniversalLLMAdapter(config.API_KEY, config.PRIMARY_LLM, config.BASE_URL, config.MODEL_NAME);
    const riskEngine = new RiskEngine({ maxScoreAutoApprove: 40, maxScoreRequireHITL: 70 });
    const pathValidator = new PathValidator(config.SANDBOX_ROOT);
    const ssh = new SSHExecutor(config.SSH_HOST, config.SSH_PORT, config.SSH_USER, config.SSH_KEY_PATH);
    const sandbox = new SandboxRuntime(ssh, pathValidator, pathValidator['isWindows']);

    const orchestrator = new TaskOrchestrator(llm, riskEngine, sandbox);
    app.decorate('orchestrator', orchestrator);

    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Autonomous OS Agent 2.0 running at http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();
