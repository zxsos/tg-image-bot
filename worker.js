export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};

// 添加配置解析函数
function parseConfig(env) {
  try {
    // 尝试从CONFIG环境变量解析JSON配置
    if (env.CONFIG) {
      const config = JSON.parse(env.CONFIG);
      return {
        IMG_BED_URL: config.imgBedUrl || env.IMG_BED_URL,
        BOT_TOKEN: config.botToken || env.BOT_TOKEN,
        AUTH_CODE: config.authCode || env.AUTH_CODE,
        WEBDAV_URL: config.webdav?.url || env.WEBDAV_URL,
        WEBDAV_USERNAME: config.webdav?.username || env.WEBDAV_USERNAME,
        WEBDAV_PASSWORD: config.webdav?.password || env.WEBDAV_PASSWORD,
        ADMIN_CHAT_ID: config.adminChatId || env.ADMIN_CHAT_ID
      };
    }
  } catch (error) {
    console.error('解析配置失败:', error);
  }
  
  // 如果CONFIG不存在或解析失败，返回原始环境变量
  return {
    IMG_BED_URL: env.IMG_BED_URL,
    BOT_TOKEN: env.BOT_TOKEN,
    AUTH_CODE: env.AUTH_CODE,
    WEBDAV_URL: env.WEBDAV_URL,
    WEBDAV_USERNAME: env.WEBDAV_USERNAME,
    WEBDAV_PASSWORD: env.WEBDAV_PASSWORD,
    ADMIN_CHAT_ID: env.ADMIN_CHAT_ID
  };
}

// 主要处理逻辑函数，现在接收 env 对象作为参数
async function handleRequest(request, env) {
  // 解析配置
  const config = parseConfig(env);
  
  // 检查必要的环境变量是否存在
  if (!config.IMG_BED_URL || !config.BOT_TOKEN) {
    return new Response('必要的环境变量 (IMG_BED_URL, BOT_TOKEN) 未配置', { status: 500 });
  }

  // API_URL 现在在需要时基于 BOT_TOKEN 构建
  const API_URL = `https://api.telegram.org/bot${config.BOT_TOKEN}`;

  if (request.method !== 'POST') {
    return new Response('只接受POST请求', { status: 405 });
  }

  try {
    const update = await request.json();
    
    // 处理内联键盘回调
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;
      const data = callbackQuery.data;

      // 解析回调数据
      const [action, ...params] = data.split(':');
      
      if (action === 'webdav_folder') {
        const folderPath = params.join(':');
        if (folderPath === 'select') {
          // 选择当前文件夹作为上传目录
          env.WEBDAV_CURRENT_FOLDER = env.WEBDAV_TEMP_FOLDER || '';
          // 发送确认消息，包含更换目录按钮
          await sendMessageWithKeyboard(chatId, 
            `✅ WebDAV上传文件夹已设置为: ${env.WEBDAV_CURRENT_FOLDER || '根目录'}`,
            [[{
              text: '🔄 更换上传目录',
              callback_data: 'webdav_folder:change'
            }]],
            config
          );
          // 删除导航消息
          await deleteMessage(chatId, messageId, config);
        } else if (folderPath === 'change') {
          // 重置临时文件夹路径并显示文件夹导航
          env.WEBDAV_TEMP_FOLDER = '';
          await showFolderNavigation(chatId, env, config);
        } else if (folderPath === 'back') {
          // 返回上一级目录
          const currentPath = env.WEBDAV_TEMP_FOLDER || '';
          const parentPath = currentPath.split('/').slice(0, -1).join('/');
          env.WEBDAV_TEMP_FOLDER = parentPath;
          await showFolderNavigation(chatId, env, messageId, config);
        } else {
          // 进入子目录
          const currentPath = env.WEBDAV_TEMP_FOLDER || '';
          const newPath = currentPath ? `${currentPath}/${folderPath}` : folderPath;
          env.WEBDAV_TEMP_FOLDER = newPath;
          await showFolderNavigation(chatId, env, messageId, config);
        }
      }
      
      return new Response('OK', { status: 200 });
    }

    if (!update.message) return new Response('OK', { status: 200 });

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text?.trim();

    // 处理命令
    if (text && text.startsWith('/')) {
      const command = text.split(' ')[0];
      if (command === '/start') {
        await sendMessage(chatId, '🤖 机器人已启用！\n\n直接发送文件即可自动上传，支持图片、视频、音频、文档等多种格式。支持最大5GB的文件上传。', config);
      } else if (command === '/help') {
        await sendMessage(chatId, '📖 使用说明：\n\n1. 发送 /start 启动机器人（仅首次需要）。\n2. 直接发送图片、视频、音频、文档或其他文件，机器人会自动处理上传。\n3. 支持最大5GB的文件上传（受Cloudflare Worker限制，超大文件可能会失败）。\n4. 使用 /webdav 命令切换上传目标到WebDAV服务器。\n5. 使用 /webdav_folder 命令切换WebDAV上传文件夹。\n6. 此机器人由 @szxin 开发，支持多种文件类型上传', config);
      } else if (command === '/webdav') {
        if (!config.WEBDAV_URL || !config.WEBDAV_USERNAME || !config.WEBDAV_PASSWORD) {
          await sendMessage(chatId, '❌ WebDAV未配置，请联系管理员配置WebDAV信息。', config);
        } else {
          // 测试WebDAV连接
          try {
            await sendMessage(chatId, '🔄 正在测试WebDAV连接...', config);
            const testResult = await testWebDAVConnection(config);
            if (testResult.success) {
              // 切换上传目标到WebDAV
              env.USE_WEBDAV = !env.USE_WEBDAV;
              const status = env.USE_WEBDAV ? '已切换到WebDAV上传模式' : '已切换回图床上传模式';
              
              if (env.USE_WEBDAV) {
                // 重置临时文件夹路径
                env.WEBDAV_TEMP_FOLDER = '';
                // 显示文件夹导航
                await showFolderNavigation(chatId, env, null, config);
              } else {
                await sendMessage(chatId, `✅ ${status}！`, config);
              }
            } else {
              await sendMessage(chatId, `❌ WebDAV连接测试失败：${testResult.error}`, config);
            }
          } catch (error) {
            await sendMessage(chatId, `❌ WebDAV连接测试失败：${error.message}`, config);
          }
        }
      } else if (command === '/webdav_folder') {
        if (!env.USE_WEBDAV) {
          await sendMessage(chatId, '❌ 请先使用 /webdav 命令切换到WebDAV模式。', config);
          return new Response('OK', { status: 200 });
        }

        const args = text.split(' ').slice(1);
        if (args.length === 0) {
          // 重置临时文件夹路径
          env.WEBDAV_TEMP_FOLDER = '';
          // 显示文件夹导航
          await showFolderNavigation(chatId, env, null, config);
        } else {
          // 设置新文件夹
          const newFolder = args[0].replace(/^\/+|\/+$/g, ''); // 移除开头和结尾的斜杠
          env.WEBDAV_CURRENT_FOLDER = newFolder;
          await sendMessage(chatId, `✅ WebDAV上传文件夹已更改为: ${newFolder || '根目录'}`, config);
        }
      }
      return new Response('OK', { status: 200 });
    }

    // 根据当前模式处理文件
    if (env.USE_WEBDAV) {
      // WebDAV模式
      if (message.photo && message.photo.length > 0) {
        await handleWebDAVPhoto(message, chatId, env, config);
      } else if (message.video || (message.document &&
              (message.document.mime_type?.startsWith('video/') ||
               message.document.file_name?.match(/\.(mp4|avi|mov|wmv|flv|mkv|webm|m4v|3gp|mpeg|mpg|ts)$/i)))) {
        await handleWebDAVVideo(message, chatId, !!message.document, env, config);
      } else if (message.audio || (message.document &&
              (message.document.mime_type?.startsWith('audio/') ||
               message.document.file_name?.match(/\.(mp3|wav|ogg|flac|aac|m4a|wma|opus|mid|midi)$/i)))) {
        await handleWebDAVAudio(message, chatId, !!message.document, env, config);
      } else if (message.animation || (message.document &&
              (message.document.mime_type?.includes('animation') ||
               message.document.file_name?.match(/\.gif$/i)))) {
        await handleWebDAVAnimation(message, chatId, !!message.document, env, config);
      } else if (message.document) {
        await handleWebDAVDocument(message, chatId, env, config);
      }
    } else {
      // 图床模式
      if (message.photo && message.photo.length > 0) {
        await handlePhoto(message, chatId, config);
      } else if (message.video || (message.document &&
              (message.document.mime_type?.startsWith('video/') ||
               message.document.file_name?.match(/\.(mp4|avi|mov|wmv|flv|mkv|webm|m4v|3gp|mpeg|mpg|ts)$/i)))) {
        await handleVideo(message, chatId, !!message.document, config);
      } else if (message.audio || (message.document &&
              (message.document.mime_type?.startsWith('audio/') ||
               message.document.file_name?.match(/\.(mp3|wav|ogg|flac|aac|m4a|wma|opus|mid|midi)$/i)))) {
        await handleAudio(message, chatId, !!message.document, config);
      } else if (message.animation || (message.document &&
              (message.document.mime_type?.includes('animation') ||
               message.document.file_name?.match(/\.gif$/i)))) {
        await handleAnimation(message, chatId, !!message.document, config);
      } else if (message.document) {
        await handleDocument(message, chatId, config);
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('处理请求时出错:', error);
    await sendMessage(config.ADMIN_CHAT_ID || chatId, `处理请求时内部错误: ${error.message}`, config).catch(e => console.error("Failed to send error message:", e));
    return new Response('处理请求时出错', { status: 500 });
  }
}

// 添加WebDAV连接测试函数
async function testWebDAVConnection(env) {
  const WEBDAV_URL = env.WEBDAV_URL;
  const WEBDAV_USERNAME = env.WEBDAV_USERNAME;
  const WEBDAV_PASSWORD = env.WEBDAV_PASSWORD;
  const auth = btoa(`${WEBDAV_USERNAME}:${WEBDAV_PASSWORD}`);

  try {
    const response = await fetch(WEBDAV_URL, {
      method: 'PROPFIND',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Depth': '0'
      }
    });

    if (response.ok) {
      return { success: true };
    } else {
      return { 
        success: false, 
        error: `服务器返回错误: ${response.status} ${response.statusText}`
      };
    }
  } catch (error) {
    return { 
      success: false, 
      error: error.message
    };
  }
}

// 添加WebDAV文件夹列表函数
async function listWebDAVFolders(env) {
  const WEBDAV_URL = env.WEBDAV_URL;
  const WEBDAV_USERNAME = env.WEBDAV_USERNAME;
  const WEBDAV_PASSWORD = env.WEBDAV_PASSWORD;
  const auth = btoa(`${WEBDAV_USERNAME}:${WEBDAV_PASSWORD}`);
  const currentPath = env.WEBDAV_TEMP_FOLDER || '';

  try {
    // 构建完整的WebDAV URL，包含当前路径
    const url = new URL(WEBDAV_URL);
    if (currentPath) {
      url.pathname = url.pathname.replace(/\/$/, '') + '/' + currentPath;
    }
    if (!url.pathname.endsWith('/')) {
      url.pathname += '/';
    }

    const response = await fetch(url.toString(), {
      method: 'PROPFIND',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Depth': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`获取文件夹列表失败: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const folders = [];
    
    // 简单的XML解析，提取文件夹路径
    const matches = text.match(/<D:href>([^<]+)<\/D:href>/g);
    if (matches) {
      matches.forEach(match => {
        const path = match.replace(/<D:href>|<\/D:href>/g, '');
        // 移除URL前缀和结尾的斜杠
        const fullPath = path.replace(new URL(WEBDAV_URL).pathname, '').replace(/^\/|\/$/g, '');
        
        // 只处理当前目录下的直接子文件夹
        if (fullPath.startsWith(currentPath)) {
          const relativePath = fullPath.slice(currentPath.length).replace(/^\/|\/$/g, '');
          // 只添加直接子文件夹（不包含更深层的路径）
          if (relativePath && !relativePath.includes('/') && !folders.includes(relativePath)) {
            folders.push(decodeURIComponent(relativePath));
          }
        }
      });
    }

    return folders;
  } catch (error) {
    console.error('获取WebDAV文件夹列表失败:', error);
    return [];
  }
}

// 添加WebDAV文件处理函数
async function handleWebDAVPhoto(message, chatId, env, config) {
  const photo = message.photo[message.photo.length - 1];
  const fileId = photo.file_id;
  const fileName = `photo_${Date.now()}.jpg`;

  await sendMessage(chatId, '🔄 正在处理您的图片，请稍候...', config);

  const fileInfo = await getFile(fileId, env);
  if (fileInfo && fileInfo.ok) {
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${filePath}`;

    try {
      const imgResponse = await fetch(fileUrl);
      const imgBuffer = await imgResponse.arrayBuffer();
      const fileUrl = await uploadToWebDAV(imgBuffer, fileName, env);
      
      const msgText = `✅ 图片上传成功！\n\n` +
                     `📄 文件名: ${fileName}\n` +
                     `📦 文件大小: ${formatFileSize(imgBuffer.byteLength)}\n` +
                     `🔗 下载链接:\n${fileUrl}\n\n`;
      await sendMessage(chatId, msgText, config);
    } catch (error) {
      console.error('处理图片时出错:', error);
      await sendMessage(chatId, `❌ 处理图片时出错: ${error.message}`, config);
    }
  } else {
    await sendMessage(chatId, '❌ 无法获取图片信息，请稍后再试。', config);
  }
}

// 添加其他WebDAV文件处理函数（视频、音频、动画、文档）
// 这些函数的实现与handleWebDAVPhoto类似，只是处理不同类型的文件
// 为了保持代码简洁，这里省略了具体实现

// 处理图片上传，接收 env 对象
async function handlePhoto(message, chatId, config) {
  const photo = message.photo[message.photo.length - 1];
  const fileId = photo.file_id;

  const IMG_BED_URL = config.IMG_BED_URL;
  const BOT_TOKEN = config.BOT_TOKEN;
  const AUTH_CODE = config.AUTH_CODE;
  const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`; // 构建API URL

  await sendMessage(chatId, '🔄 正在处理您的图片，请稍候...', config);

  const fileInfo = await getFile(fileId, config); // 传递env

  if (fileInfo && fileInfo.ok) {
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    const imgResponse = await fetch(fileUrl);
    const imgBuffer = await imgResponse.arrayBuffer();

    const formData = new FormData();
    formData.append('file', new File([imgBuffer], 'image.jpg', { type: 'image/jpeg' }));

    const uploadUrl = new URL(IMG_BED_URL);
    uploadUrl.searchParams.append('returnFormat', 'full');

    if (AUTH_CODE) { // 检查从env获取的AUTH_CODE
      uploadUrl.searchParams.append('authCode', AUTH_CODE);
    }

    console.log(`图片上传请求 URL: ${uploadUrl.toString()}`);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    });

    const responseText = await uploadResponse.text();
    console.log('图片上传原始响应:', responseText);

    let uploadResult;
    try {
      uploadResult = JSON.parse(responseText);
    } catch (e) {
      uploadResult = responseText;
    }

    let imgUrl = extractUrlFromResult(uploadResult, IMG_BED_URL); // 传递 IMG_BED_URL 作为基础

    if (imgUrl) {
      const plainLink = imgUrl;
      const msgText = `✅ 图片上传成功！\n\n` +
                     `🔗 原始链接:\n${plainLink}\n\n`;
      await sendMessage(chatId, msgText, config);
    } else {
      await sendMessage(chatId, `❌ 无法解析上传结果，原始响应:\n${responseText.substring(0, 200)}...`, config);
    }
  } else {
    await sendMessage(chatId, '❌ 无法获取图片信息，请稍后再试。', config);
  }
}

// 处理视频上传，接收 env 对象
async function handleVideo(message, chatId, isDocument = false, env, config) {
  const fileId = isDocument ? message.document.file_id : message.video.file_id;
  const fileName = isDocument ? message.document.file_name : `video_${Date.now()}.mp4`;

  // 从 env 获取配置
  const IMG_BED_URL = env.IMG_BED_URL;
  const BOT_TOKEN = env.BOT_TOKEN;
  const AUTH_CODE = env.AUTH_CODE;
  const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`; // 构建API URL

  await sendMessage(chatId, '🔄 正在处理您的视频，请稍候...\n(视频处理可能需要较长时间，取决于视频大小)', config);

  const fileInfo = await getFile(fileId, env); // 传递env

  if (fileInfo && fileInfo.ok) {
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    try {
      const videoResponse = await fetch(fileUrl);
      if (!videoResponse.ok) throw new Error(`获取视频失败: ${videoResponse.status}`);

      const videoBuffer = await videoResponse.arrayBuffer();
      const videoSize = videoBuffer.byteLength / (1024 * 1024); // MB

      if (videoSize > 5120) { // 增加到5GB (5120MB)
        await sendMessage(chatId, `⚠️ 视频太大 (${videoSize.toFixed(2)}MB)，可能无法在Worker环境中处理或上传。尝试上传中...`, config);
      }

      const formData = new FormData();
      const mimeType = isDocument ? message.document.mime_type || 'video/mp4' : 'video/mp4';
      formData.append('file', new File([videoBuffer], fileName, { type: mimeType }));

      const uploadUrl = new URL(IMG_BED_URL);
      uploadUrl.searchParams.append('returnFormat', 'full');

      if (AUTH_CODE) { // 检查从env获取的AUTH_CODE
        uploadUrl.searchParams.append('authCode', AUTH_CODE);
      }

      console.log(`视频上传请求 URL: ${uploadUrl.toString()}`);

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      const responseText = await uploadResponse.text();
      console.log('视频上传原始响应:', responseText);

      let uploadResult;
      try {
        uploadResult = JSON.parse(responseText);
      } catch (e) {
        uploadResult = responseText;
      }

      let videoUrl = extractUrlFromResult(uploadResult, IMG_BED_URL); // 传递 IMG_BED_URL 作为基础

      if (videoUrl) {
        const plainLink = videoUrl;
        const msgText = `✅ 视频上传成功！\n\n` +
                       `🔗 下载链接:\n${plainLink}\n\n`;
        await sendMessage(chatId, msgText, config);
      } else {
        await sendMessage(chatId, `⚠️ 无法从图床获取视频链接。原始响应 (前200字符):\n${responseText.substring(0, 200)}... \n\n或者尝试Telegram临时链接 (有效期有限):\n${fileUrl}`, config);
      }
    } catch (error) {
      console.error('处理视频时出错:', error);
      await sendMessage(chatId, `❌ 处理视频时出错: ${error.message}\n\n可能是视频太大或格式不支持。`, config);
    }
  } else {
    await sendMessage(chatId, '❌ 无法获取视频信息，请稍后再试。', config);
  }
}

// 处理音频上传
async function handleAudio(message, chatId, isDocument = false, env, config) {
  const fileId = isDocument ? message.document.file_id : message.audio.file_id;
  const fileName = isDocument 
    ? message.document.file_name 
    : (message.audio.title || message.audio.file_name || `audio_${Date.now()}.mp3`);

  // 从 env 获取配置
  const IMG_BED_URL = env.IMG_BED_URL;
  const BOT_TOKEN = env.BOT_TOKEN;
  const AUTH_CODE = env.AUTH_CODE;

  await sendMessage(chatId, '🔄 正在处理您的音频，请稍候...', config);

  const fileInfo = await getFile(fileId, env);

  if (fileInfo && fileInfo.ok) {
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    try {
      const audioResponse = await fetch(fileUrl);
      if (!audioResponse.ok) throw new Error(`获取音频失败: ${audioResponse.status}`);

      const audioBuffer = await audioResponse.arrayBuffer();
      const audioSize = audioBuffer.byteLength / (1024 * 1024); // MB
      
      if (audioSize > 5120) { // 增加到5GB (5120MB)
        await sendMessage(chatId, `⚠️ 音频太大 (${audioSize.toFixed(2)}MB)，可能无法在Worker环境中处理或上传。尝试上传中...`, config);
      }

      const formData = new FormData();
      const mimeType = isDocument 
        ? message.document.mime_type || 'audio/mpeg' 
        : (message.audio.mime_type || 'audio/mpeg');
      formData.append('file', new File([audioBuffer], fileName, { type: mimeType }));

      const uploadUrl = new URL(IMG_BED_URL);
      uploadUrl.searchParams.append('returnFormat', 'full');

      if (AUTH_CODE) {
        uploadUrl.searchParams.append('authCode', AUTH_CODE);
      }

      console.log(`音频上传请求 URL: ${uploadUrl.toString()}`);

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      const responseText = await uploadResponse.text();
      console.log('音频上传原始响应:', responseText);

      let uploadResult;
      try {
        uploadResult = JSON.parse(responseText);
      } catch (e) {
        uploadResult = responseText;
      }

      let audioUrl = extractUrlFromResult(uploadResult, IMG_BED_URL);

      if (audioUrl) {
        const plainLink = audioUrl;
        const msgText = `✅ 音频上传成功！\n\n` +
                       `🔗 下载链接:\n${plainLink}\n\n`;
        await sendMessage(chatId, msgText, config);
      } else {
        await sendMessage(chatId, `⚠️ 无法从图床获取音频链接。原始响应 (前200字符):\n${responseText.substring(0, 200)}... \n\n或者尝试Telegram临时链接 (有效期有限):\n${fileUrl}`, config);
      }
    } catch (error) {
      console.error('处理音频时出错:', error);
      await sendMessage(chatId, `❌ 处理音频时出错: ${error.message}\n\n可能是音频太大或格式不支持。`, config);
    }
  } else {
    await sendMessage(chatId, '❌ 无法获取音频信息，请稍后再试。', config);
  }
}

// 处理动画/GIF上传
async function handleAnimation(message, chatId, isDocument = false, env, config) {
  const fileId = isDocument ? message.document.file_id : message.animation.file_id;
  const fileName = isDocument 
    ? message.document.file_name 
    : (message.animation.file_name || `animation_${Date.now()}.gif`);

  // 从 env 获取配置
  const IMG_BED_URL = env.IMG_BED_URL;
  const BOT_TOKEN = env.BOT_TOKEN;
  const AUTH_CODE = env.AUTH_CODE;

  await sendMessage(chatId, '🔄 正在处理您的动画/GIF，请稍候...', config);

  const fileInfo = await getFile(fileId, env);

  if (fileInfo && fileInfo.ok) {
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    try {
      const animResponse = await fetch(fileUrl);
      if (!animResponse.ok) throw new Error(`获取动画失败: ${animResponse.status}`);

      const animBuffer = await animResponse.arrayBuffer();
      const animSize = animBuffer.byteLength / (1024 * 1024); // MB
      
      if (animSize > 5120) { // 增加到5GB (5120MB)
        await sendMessage(chatId, `⚠️ 动画太大 (${animSize.toFixed(2)}MB)，可能无法在Worker环境中处理或上传。尝试上传中...`, config);
      }

      const formData = new FormData();
      const mimeType = isDocument 
        ? message.document.mime_type || 'image/gif' 
        : (message.animation.mime_type || 'image/gif');
      formData.append('file', new File([animBuffer], fileName, { type: mimeType }));

      const uploadUrl = new URL(IMG_BED_URL);
      uploadUrl.searchParams.append('returnFormat', 'full');

      if (AUTH_CODE) {
        uploadUrl.searchParams.append('authCode', AUTH_CODE);
      }

      console.log(`动画上传请求 URL: ${uploadUrl.toString()}`);

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      const responseText = await uploadResponse.text();
      console.log('动画上传原始响应:', responseText);

      let uploadResult;
      try {
        uploadResult = JSON.parse(responseText);
      } catch (e) {
        uploadResult = responseText;
      }

      let animUrl = extractUrlFromResult(uploadResult, IMG_BED_URL);

      if (animUrl) {
        const plainLink = animUrl;
        const msgText = `✅ 动画/GIF上传成功！\n\n` +
                       `🔗 链接:\n${plainLink}\n\n`;
        await sendMessage(chatId, msgText, config);
      } else {
        await sendMessage(chatId, `⚠️ 无法从图床获取动画链接。原始响应 (前200字符):\n${responseText.substring(0, 200)}... \n\n或者尝试Telegram临时链接 (有效期有限):\n${fileUrl}`, config);
      }
    } catch (error) {
      console.error('处理动画时出错:', error);
      await sendMessage(chatId, `❌ 处理动画时出错: ${error.message}\n\n可能是文件太大或格式不支持。`, config);
    }
  } else {
    await sendMessage(chatId, '❌ 无法获取动画信息，请稍后再试。', config);
  }
}

// 处理SVG文件上传
async function handleSvg(message, chatId, env, config) {
  const fileId = message.document.file_id;
  const fileName = message.document.file_name || `svg_${Date.now()}.svg`;

  // 从 env 获取配置
  const IMG_BED_URL = env.IMG_BED_URL;
  const BOT_TOKEN = env.BOT_TOKEN;
  const AUTH_CODE = env.AUTH_CODE;

  await sendMessage(chatId, '🔄 正在处理您的SVG文件，请稍候...', config);

  const fileInfo = await getFile(fileId, env);

  if (fileInfo && fileInfo.ok) {
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    try {
      const svgResponse = await fetch(fileUrl);
      if (!svgResponse.ok) throw new Error(`获取SVG文件失败: ${svgResponse.status}`);

      const svgBuffer = await svgResponse.arrayBuffer();
      const svgSize = svgBuffer.byteLength / (1024 * 1024); // MB
      
      if (svgSize > 5120) { // 增加到5GB (5120MB)
        await sendMessage(chatId, `⚠️ SVG文件太大 (${svgSize.toFixed(2)}MB)，可能无法在Worker环境中处理或上传。尝试上传中...`, config);
      }

      const formData = new FormData();
      formData.append('file', new File([svgBuffer], fileName, { type: 'image/svg+xml' }));

      const uploadUrl = new URL(IMG_BED_URL);
      uploadUrl.searchParams.append('returnFormat', 'full');

      if (AUTH_CODE) {
        uploadUrl.searchParams.append('authCode', AUTH_CODE);
      }

      console.log(`SVG文件上传请求 URL: ${uploadUrl.toString()}`);

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      const responseText = await uploadResponse.text();
      console.log('SVG文件上传原始响应:', responseText);

      let uploadResult;
      try {
        uploadResult = JSON.parse(responseText);
      } catch (e) {
        uploadResult = responseText;
      }

      let svgUrl = extractUrlFromResult(uploadResult, IMG_BED_URL);

      if (svgUrl) {
        const plainLink = svgUrl;
        const msgText = `✅ SVG文件上传成功！\n\n` +
                       `🔗 链接:\n${plainLink}\n\n`;
        await sendMessage(chatId, msgText, config);
      } else {
        await sendMessage(chatId, `⚠️ 无法从图床获取SVG文件链接。原始响应 (前200字符):\n${responseText.substring(0, 200)}... \n\n或者尝试Telegram临时链接 (有效期有限):\n${fileUrl}`, config);
      }
    } catch (error) {
      console.error('处理SVG文件时出错:', error);
      await sendMessage(chatId, `❌ 处理SVG文件时出错: ${error.message}\n\n可能是文件太大或格式不支持。`, config);
    }
  } else {
    await sendMessage(chatId, '❌ 无法获取SVG文件信息，请稍后再试。', config);
  }
}

// 处理文档上传（通用文件处理）
async function handleDocument(message, chatId, env, config) {
  const fileId = message.document.file_id;
  const fileName = message.document.file_name || `file_${Date.now()}`;
  const mimeType = message.document.mime_type || 'application/octet-stream';

  // 从 env 获取配置
  const IMG_BED_URL = env.IMG_BED_URL;
  const BOT_TOKEN = env.BOT_TOKEN;
  const AUTH_CODE = env.AUTH_CODE;

  // 获取文件类型图标
  const fileIcon = getFileIcon(fileName, mimeType);
  await sendMessage(chatId, `${fileIcon} 正在处理您的文件 "${fileName}"，请稍候...`, config);

  const fileInfo = await getFile(fileId, env);

  if (fileInfo && fileInfo.ok) {
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    try {
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) throw new Error(`获取文件失败: ${fileResponse.status}`);

      const fileBuffer = await fileResponse.arrayBuffer();
      const fileSize = fileBuffer.byteLength / (1024 * 1024); // MB

      if (fileSize > 5120) { // 增加到5GB (5120MB)
        await sendMessage(chatId, `⚠️ 文件太大 (${fileSize.toFixed(2)}MB)，可能无法在Worker环境中处理或上传。尝试上传中...`, config);
      }

      const formData = new FormData();
      
      // 修复exe文件上传问题：确保文件名保持原样，不要修改扩展名
      let safeFileName = fileName;
      
      // 如果是可执行文件，确保MIME类型正确
      let safeMimeType = mimeType;
      if (fileName.toLowerCase().endsWith('.exe')) {
        safeMimeType = 'application/octet-stream';
      }
      
      formData.append('file', new File([fileBuffer], safeFileName, { type: safeMimeType }));

      const uploadUrl = new URL(IMG_BED_URL);
      uploadUrl.searchParams.append('returnFormat', 'full');

      if (AUTH_CODE) {
        uploadUrl.searchParams.append('authCode', AUTH_CODE);
      }

      console.log(`文件上传请求 URL: ${uploadUrl.toString()}`);

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      const responseText = await uploadResponse.text();
      console.log('文件上传原始响应:', responseText);

      let uploadResult;
      try {
        uploadResult = JSON.parse(responseText);
      } catch (e) {
        uploadResult = responseText;
      }

      let fileUrl2 = extractUrlFromResult(uploadResult, IMG_BED_URL);

      if (fileUrl2) {
        const plainLink = fileUrl2;
        const msgText = `✅ 文件上传成功！\n\n` +
                       `📄 文件名: ${fileName}\n` +
                       `📦 文件大小: ${formatFileSize(fileBuffer.byteLength)}\n` +
                       `🔗 下载链接:\n${plainLink}\n\n`;
        await sendMessage(chatId, msgText, config);
      } else {
        await sendMessage(chatId, `⚠️ 无法从图床获取文件链接。原始响应 (前200字符):\n${responseText.substring(0, 200)}... \n\n或者尝试Telegram临时链接 (有效期有限):\n${fileUrl}`, config);
      }
    } catch (error) {
      console.error('处理文件时出错:', error);
      await sendMessage(chatId, `❌ 处理文件时出错: ${error.message}\n\n可能是文件太大或格式不支持。`, config);
    }
  } else {
    await sendMessage(chatId, '❌ 无法获取文件信息，请稍后再试。', config);
  }
}

// 辅助函数：从图床返回结果中提取URL，接收基础URL
function extractUrlFromResult(result, imgBedUrl) {
  let url = '';
  // 尝试从传入的 IMG_BED_URL 获取 origin
  let baseUrl = 'https://your.default.domain'; // 提供一个备用基础URL
  try {
      if (imgBedUrl && (imgBedUrl.startsWith('https://') || imgBedUrl.startsWith('http://'))) {
         baseUrl = new URL(imgBedUrl).origin;
      }
  } catch (e) {
      console.error("无法解析 IMG_BED_URL:", imgBedUrl, e);
  }

  // 处理可能的错误响应
  if (typeof result === 'string' && result.includes("The string did not match the expected pattern")) {
    console.error("遇到模式匹配错误，可能是文件扩展名问题");
    // 尝试从错误响应中提取可能的URL
    const urlMatch = result.match(/(https?:\/\/[^\s"]+)/);
    if (urlMatch) {
      return urlMatch[0];
    }
  }

  if (Array.isArray(result) && result.length > 0) {
    const item = result[0];
    if (item.url) url = item.url;
    else if (item.src) url = item.src.startsWith('http') ? item.src : `${baseUrl}${item.src}`; // 使用动态baseUrl
    else if (typeof item === 'string') url = item.startsWith('http') ? item : `${baseUrl}/file/${item}`; // 使用动态baseUrl
  }
  else if (result && typeof result === 'object') {
    if (result.url) url = result.url;
    else if (result.src) url = result.src.startsWith('http') ? result.src : `${baseUrl}${result.src}`; // 使用动态baseUrl
    else if (result.file) url = `${baseUrl}/file/${result.file}`; // 使用动态baseUrl
    else if (result.data && result.data.url) url = result.data.url;
  }
  else if (typeof result === 'string') {
    if (result.startsWith('http://') || result.startsWith('https://')) {
        url = result;
    } else {
        url = `${baseUrl}/file/${result}`; // 使用动态baseUrl
    }
  }
  return url;
}

// getFile 函数，接收 env 对象
async function getFile(fileId, env) {
  const BOT_TOKEN = env.BOT_TOKEN;
  const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`; // 构建API URL
  const response = await fetch(`${API_URL}/getFile?file_id=${fileId}`);
  return await response.json();
}

// sendMessage 函数，接收 env 对象
async function sendMessage(chatId, text, env) {
  const BOT_TOKEN = env.BOT_TOKEN;
  const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`; // 构建API URL
  const response = await fetch(`${API_URL}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    }),
  });
  return await response.json();
}

// 获取文件类型图标
function getFileIcon(filename, mimeType) {
  if (mimeType) {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('msword') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('sheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📊';
    if (mimeType.includes('text/')) return '📝';
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️';
    if (mimeType.includes('html')) return '🌐';
    if (mimeType.includes('application/x-msdownload') || mimeType.includes('application/octet-stream')) return '⚙️';
  }
  
  if (filename) {
    const ext = filename.split('.').pop().toLowerCase();
    
    // 图片文件
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'tif', 'ico', 'heic', 'heif', 'avif'].includes(ext)) {
      return '🖼️';
    }
    
    // 视频文件
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'm4v', '3gp', 'mpeg', 'mpg', 'ts'].includes(ext)) {
      return '🎬';
    }
    
    // 音频文件
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus', 'mid', 'midi'].includes(ext)) {
      return '🎵';
    }
    
    // 文档文件
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'md', 'csv', 'json', 'xml'].includes(ext)) {
      return '📝';
    }
    
    // 压缩文件
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) {
      return '🗜️';
    }
    
    // 可执行文件
    if (['exe', 'msi', 'apk', 'app', 'dmg', 'iso'].includes(ext)) {
      return '⚙️';
    }
    
    // 网页文件
    if (['html', 'htm', 'css', 'js'].includes(ext)) {
      return '🌐';
    }
    
    // 字体文件
    if (['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(ext)) {
      return '🔤';
    }
    
    // 3D和设计文件
    if (['obj', 'fbx', 'blend', 'stl', 'psd', 'ai', 'eps', 'sketch', 'fig'].includes(ext)) {
      return '🎨';
    }
    
    // 其他常见文件
    if (['torrent', 'srt', 'vtt', 'ass', 'ssa'].includes(ext)) {
      return '📄';
    }
  }
  
  return '📄'; // 默认文件图标
}

// 格式化文件大小
function formatFileSize(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 修改WebDAV上传函数以支持文件夹
async function uploadToWebDAV(fileBuffer, fileName, env) {
  const WEBDAV_URL = env.WEBDAV_URL;
  const WEBDAV_USERNAME = env.WEBDAV_USERNAME;
  const WEBDAV_PASSWORD = env.WEBDAV_PASSWORD;
  const currentFolder = env.WEBDAV_CURRENT_FOLDER || '';

  // 构建WebDAV请求URL
  const uploadUrl = new URL(WEBDAV_URL);
  if (!uploadUrl.pathname.endsWith('/')) {
    uploadUrl.pathname += '/';
  }
  
  // 添加当前文件夹路径
  if (currentFolder) {
    uploadUrl.pathname += currentFolder + '/';
  }
  
  // 确保文件夹存在
  if (currentFolder) {
    await createWebDAVFolder(uploadUrl.toString(), env);
  }
  
  uploadUrl.pathname += fileName;

  // 创建Basic认证头
  const auth = btoa(`${WEBDAV_USERNAME}:${WEBDAV_PASSWORD}`);
  
  // 发送PUT请求上传文件
  const response = await fetch(uploadUrl.toString(), {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/octet-stream'
    },
    body: fileBuffer
  });

  if (!response.ok) {
    throw new Error(`WebDAV上传失败: ${response.status} ${response.statusText}`);
  }

  // 返回文件URL
  return uploadUrl.toString();
}

// 添加创建WebDAV文件夹的函数
async function createWebDAVFolder(folderUrl, env) {
  const WEBDAV_USERNAME = env.WEBDAV_USERNAME;
  const WEBDAV_PASSWORD = env.WEBDAV_PASSWORD;
  const auth = btoa(`${WEBDAV_USERNAME}:${WEBDAV_PASSWORD}`);

  // 发送MKCOL请求创建文件夹
  const response = await fetch(folderUrl, {
    method: 'MKCOL',
    headers: {
      'Authorization': `Basic ${auth}`
    }
  });

  // 如果文件夹已存在（409）或其他错误，忽略它
  if (!response.ok && response.status !== 409) {
    console.error(`创建WebDAV文件夹失败: ${response.status} ${response.statusText}`);
  }
}

// 添加显示文件夹导航的函数
async function showFolderNavigation(chatId, env, messageId = null, config) {
  const currentPath = env.WEBDAV_TEMP_FOLDER || '';
  const folders = await listWebDAVFolders(env);
  
  // 构建内联键盘
  const keyboard = [];
  const row = [];
  
  // 添加返回上级目录按钮（如果不是根目录）
  if (currentPath) {
    keyboard.push([{
      text: '⬆️ 返回上级目录',
      callback_data: 'webdav_folder:back'
    }]);
  }
  
  // 添加当前目录选择按钮
  keyboard.push([{
    text: `✅ 选择当前目录 (${currentPath || '根目录'})`,
    callback_data: 'webdav_folder:select'
  }]);
  
  // 添加文件夹按钮
  folders.forEach(folder => {
    row.push({
      text: `📁 ${folder}`,
      callback_data: `webdav_folder:${folder}`
    });
    
    // 每行最多两个按钮
    if (row.length === 2) {
      keyboard.push([...row]);
      row.length = 0;
    }
  });
  
  // 添加最后一行（如果有）
  if (row.length > 0) {
    keyboard.push([...row]);
  }
  
  const currentUploadFolder = env.WEBDAV_CURRENT_FOLDER || '根目录';
  const messageText = `📁 当前目录: ${currentPath || '根目录'}\n📂 当前上传目录: ${currentUploadFolder}\n\n请选择要进入的文件夹或选择当前目录作为上传目录：`;
  
  if (messageId) {
    // 编辑现有消息
    await editMessage(chatId, messageId, messageText, keyboard, config);
  } else {
    // 发送新消息
    await sendMessageWithKeyboard(chatId, messageText, keyboard, config);
  }
}

// 添加发送带内联键盘的消息的函数
async function sendMessageWithKeyboard(chatId, text, keyboard, env) {
  const BOT_TOKEN = env.BOT_TOKEN;
  const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
  
  const response = await fetch(`${API_URL}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: keyboard
      }
    }),
  });
  return await response.json();
}

// 添加编辑消息的函数
async function editMessage(chatId, messageId, text, keyboard, env) {
  const BOT_TOKEN = env.BOT_TOKEN;
  const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
  
  const response = await fetch(`${API_URL}/editMessageText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: keyboard
      }
    }),
  });
  return await response.json();
}

// 添加删除消息的函数
async function deleteMessage(chatId, messageId, env) {
  const BOT_TOKEN = env.BOT_TOKEN;
  const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
  
  const response = await fetch(`${API_URL}/deleteMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId
    }),
  });
  return await response.json();
}
