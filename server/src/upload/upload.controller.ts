import {
  Controller,
  Post,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('未提供文件');
    }

    // 验证文件类型
    if (!this.uploadService.validateImageFile(file)) {
      throw new BadRequestException('不支持的文件类型，仅支持 JPEG, PNG, GIF, WebP, SVG');
    }

    // 验证文件大小 (5MB)
    if (!this.uploadService.validateFileSize(file)) {
      throw new BadRequestException('文件大小超过限制 (最大 5MB)');
    }

    // 保存文件到数据库并返回图片 ID
    const imageId = await this.uploadService.saveImage(file);
    
    // 返回相对 URL 路径（通过 Vite 代理访问）
    const imageUrl = `/api/upload/image/${imageId}`;

    return {
      url: imageUrl,
      filename: file.originalname,
      size: file.size,
    };
  }

  @Get('image/:id')
  async getImage(@Param('id') id: string, @Res() res: Response) {
    const image = await this.uploadService.getImage(id);

    if (!image) {
      throw new NotFoundException('图片不存在');
    }

    // 设置响应头
    res.setHeader('Content-Type', image.mimetype);
    res.setHeader('Content-Length', image.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 缓存一年

    // 发送图片数据
    res.send(image.data);
  }
}
