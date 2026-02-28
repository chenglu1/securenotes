import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Image } from '../entities/image.entity';

@Injectable()
export class UploadService {
  constructor(
    @InjectRepository(Image)
    private imageRepository: Repository<Image>,
  ) {}

  /**
   * 保存上传的图片到数据库
   */
  async saveImage(file: Express.Multer.File): Promise<string> {
    // 创建图片记录
    const image = this.imageRepository.create({
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      data: file.buffer,
    });

    // 保存到数据库
    const savedImage = await this.imageRepository.save(image);

    // 返回图片 ID
    return savedImage.id;
  }

  /**
   * 根据 ID 获取图片
   */
  async getImage(id: string): Promise<Image | null> {
    return this.imageRepository.findOne({ where: { id } });
  }

  /**
   * 验证文件类型
   */
  validateImageFile(file: Express.Multer.File): boolean {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ];
    return allowedMimeTypes.includes(file.mimetype);
  }

  /**
   * 验证文件大小
   */
  validateFileSize(file: Express.Multer.File, maxSize: number = 5 * 1024 * 1024): boolean {
    return file.size <= maxSize;
  }
}
