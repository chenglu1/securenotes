import { IsString, IsNumber, IsOptional, IsArray, Min, ArrayNotEmpty } from 'class-validator';

export class UpsertNoteDto {
  @IsString({ message: 'encryptedTitle 必须是字符串' })
  encryptedTitle!: string;

  @IsString({ message: 'encryptedContent 必须是字符串' })
  encryptedContent!: string;

  @IsNumber({}, { message: 'syncVersion 必须是数字' })
  @Min(0, { message: 'syncVersion 不能为负数' })
  syncVersion!: number;

  @IsOptional()
  @IsArray({ message: 'yjsState 必须是数组' })
  yjsState?: number[];

  @IsOptional()
  @IsString({ message: 'deletedAt 必须是字符串' })
  deletedAt?: string;
}
