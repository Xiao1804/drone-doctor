import React from 'react'

function WeChatQR({ size = 'md' }) {
  const sizeClass = size === 'lg' ? 'w-48 h-48' : size === 'sm' ? 'w-24 h-24' : 'w-32 h-32'

  return (
    <div className="text-center">
      <div className={`inline-block ${sizeClass} bg-white rounded-xl border border-gray-200 p-2`}>
        <img
          src="/wechat-qr.jpg"
          alt="微信二维码"
          className="w-full h-full rounded-lg object-contain"
          onError={(e) => {
            e.target.style.display = 'none'
            e.target.nextSibling.style.display = 'flex'
          }}
        />
        <div
          className="hidden w-full h-full bg-gray-50 rounded-lg items-center justify-center text-gray-400 text-xs text-center p-2"
        >
          微信二维码<br />占位图
        </div>
      </div>
      <p className="text-sm text-gray-600 font-medium mt-2">扫码加微信</p>
      <p className="text-xs text-gray-400">免费体验3天</p>
    </div>
  )
}

export default WeChatQR
