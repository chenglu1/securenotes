/**
 * 图片上传服务示例
 * 
 * 使用方式：
 * 1. 配置实际的上传接口地址
 * 2. 根据服务器响应格式调整解析逻辑
 */

export interface UploadResponse {
  url: string
  filename?: string
  size?: number
}

/**
 * 上传图片到服务器
 * @param file 要上传的文件
 * @param onProgress 上传进度回调
 * @param abortSignal 取消信号
 * @returns 图片 URL
 */
export async function uploadImage(
  file: File,
  onProgress?: (event: { progress: number }) => void,
  abortSignal?: AbortSignal
): Promise<string> {
  // 文件类型验证
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
  if (!allowedTypes.includes(file.type)) {
    throw new Error(`不支持的文件类型: ${file.type}`)
  }

  // 文件大小验证 (5MB)
  const maxSize = 5 * 1024 * 1024
  if (file.size > maxSize) {
    throw new Error(`文件大小超过限制 (最大 ${maxSize / 1024 / 1024}MB)`)
  }

  const formData = new FormData()
  formData.append('file', file)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    // 上传进度
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = (event.loaded / event.total) * 100
        onProgress({ progress })
      }
    })

    // 上传完成
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response: UploadResponse = JSON.parse(xhr.responseText)
          
          // 验证响应中是否包含 URL
          if (!response.url) {
            reject(new Error('服务器响应中缺少图片 URL'))
            return
          }
          
          resolve(response.url)
        } catch (error) {
          reject(new Error('解析服务器响应失败'))
        }
      } else {
        reject(new Error(`上传失败: HTTP ${xhr.status}`))
      }
    })

    // 上传错误
    xhr.addEventListener('error', () => {
      reject(new Error('网络错误，上传失败'))
    })

    // 上传超时
    xhr.addEventListener('timeout', () => {
      reject(new Error('上传超时'))
    })

    // 支持取消上传
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        xhr.abort()
        reject(new Error('上传已取消'))
      })
    }

    // 配置请求
    xhr.open('POST', '/api/upload/image') // 修改为实际的上传接口地址
    xhr.timeout = 60000 // 60秒超时
    
    // 如果需要添加认证令牌
    // xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    
    xhr.send(formData)
  })
}

/**
 * 使用 Fetch API 的上传方式（不支持进度回调）
 */
export async function uploadImageWithFetch(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/upload/image', {
    method: 'POST',
    body: formData,
    // headers: {
    //   'Authorization': `Bearer ${token}`
    // }
  })

  if (!response.ok) {
    throw new Error(`上传失败: HTTP ${response.status}`)
  }

  const data: UploadResponse = await response.json()
  
  if (!data.url) {
    throw new Error('服务器响应中缺少图片 URL')
  }

  return data.url
}
