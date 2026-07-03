import {
  IsDefined,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ExecuteWorkflowDto {
  // inputData accepts a string or an object of template variables. @IsDefined
  // marks the property as known to the validator; without any decorator,
  // ValidationPipe({ whitelist: true }) would silently strip it.
  @IsDefined()
  inputData!: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;
}
