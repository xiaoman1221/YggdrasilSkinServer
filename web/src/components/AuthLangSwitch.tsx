import LanguageSwitcher from './LanguageSwitcher'

/**
 * 认证页右上角语言切换按钮。
 * 需要父级 .auth-main 具备 position: relative 定位。
 */
export default function AuthLangSwitch() {
  return (
    <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 20 }}>
      <LanguageSwitcher />
    </div>
  )
}
