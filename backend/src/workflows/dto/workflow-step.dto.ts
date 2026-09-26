import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class WorkflowStepDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  promptTemplate!: string;

  // Omit (or send null) to run the step on the model chosen for the run.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string | null;
}
