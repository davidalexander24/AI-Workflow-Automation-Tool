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

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  promptTemplate?: string;

  // Replaces the whole list when present; send [] to make it single-step.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FOLLOW_UP_STEPS)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];
}
