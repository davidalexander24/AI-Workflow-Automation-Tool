import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_FOLLOW_UP_STEPS } from '../chain';
import { WorkflowStepDto } from './workflow-step.dto';

export class CreateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  promptTemplate!: string;

  // Steps that run after promptTemplate, in order. Empty or omitted means a
  // single-step workflow.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FOLLOW_UP_STEPS)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];
}
