import { IsString, MinLength } from 'class-validator';

export class SyncKeyDto {
  @IsString({ message: 'keyVerifier 必须是字符串' })
  @MinLength(1, { message: 'keyVerifier 不能为空' })
  keyVerifier!: string;
}
