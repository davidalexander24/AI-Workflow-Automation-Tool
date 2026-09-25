import { Controller, Get } from '@nestjs/common';
import { availableModels, defaultModel } from './model-registry';

@Controller('models')
export class ModelsController {
  // The frontend builds its picker from this, so a model only appears when the
  // server actually holds a key for its provider.
  @Get()
  listModels() {
    return {
      defaultModel: defaultModel()?.id ?? null,
      models: availableModels().map(({ id, label, maker, provider }) => ({
        id,
        label,
        maker,
        provider,
      })),
    };
  }
}
