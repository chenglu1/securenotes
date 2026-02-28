import { useState } from 'react'
import { X } from 'lucide-react'
import { useNoteStore } from '../../stores/noteStore'

interface AuthModalProps {
  onClose: () => void
}

export function AuthModal({ onClose }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const login = useNoteStore((s) => s.login)
  const register = useNoteStore((s) => s.register)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        await login(email, password)
      } else {
        await register(email, password)
      }
      // 成功后关闭模态框
      onClose()
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[420px] rounded-2xl bg-[#1a1a24] p-8 shadow-2xl border border-[#2a2a3a] relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#9a9ab0] hover:text-[#e8e8ed] transition-colors p-1 flex items-center"
          title="关闭"
        >
          <X size={20} />
        </button>
        
        <h2 className="mb-6 text-2xl font-bold text-[#e8e8ed]">
          {isLogin ? '登录' : '注册'} SecureNotes
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[13px] font-medium text-[#c7c7d3] mb-2">
              邮箱
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-[#0f0f13] border border-[#2a2a3a] px-3.5 py-2.5 text-[#e8e8ed] text-sm outline-none focus:border-[#6366f1] transition-colors"
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[#c7c7d3] mb-2">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-[#0f0f13] border border-[#2a2a3a] px-3.5 py-2.5 text-[#e8e8ed] text-sm outline-none focus:border-[#6366f1] transition-colors"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#6366f1] px-4 py-2.5 font-medium text-white text-sm mt-2 hover:bg-[#818cf8] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? '处理中...' : isLogin ? '登录' : '注册'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-[13px] text-[#818cf8] hover:text-[#a5b4fc] transition-colors"
          >
            {isLogin ? '没有账号？注册' : '已有账号？登录'}
          </button>
        </div>

        <div className="mt-6 pt-6 border-t border-[#2a2a3a]">
          <p className="text-xs text-[#6e6e8a] text-center">
            💡 提示：注册后数据将同步到云端
          </p>
        </div>
      </div>
    </div>
  )
}
