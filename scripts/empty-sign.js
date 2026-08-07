// electron-builder 自定义签名脚本：不做任何签名，直接返回原可执行文件路径。
// 用于本机无法访问 GitHub 下载 signtool、且没有代码签名证书的场景。
module.exports = async (configuration) => {
  // configuration.path 为待签名文件；返回它即可（即保持未签名）。
  return configuration.path
}
