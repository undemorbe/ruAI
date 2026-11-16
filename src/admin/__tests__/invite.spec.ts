import { beforeEach, describe, expect, it } from 'vitest'
import { mockAdmin } from '../api/mock'
import { checkInvitePassword, groupSecret, inviteToken } from '../invite'

describe('ссылка-приглашение', () => {
  it('токен только из #/invite/<token>', () => {
    const t = 'AbC_-123456789012345678901234567890123'
    expect(inviteToken(`#/invite/${t}`)).toBe(t)
    expect(inviteToken('#/overview')).toBeNull()
    expect(inviteToken('#/invite/short')).toBeNull()
    expect(inviteToken(`#/invite/${t}/extra`)).toBeNull()
    expect(inviteToken(`#/invite/${t}<script>`)).toBeNull()
  })

  it('пароль: от 14 символов и совпадает с повтором', () => {
    expect(checkInvitePassword('short', 'short')).toMatch(/14/)
    expect(checkInvitePassword('длинный пароль ок', 'другой пароль ок')).toMatch(/не совпадают/)
    expect(checkInvitePassword('длинный пароль ок', 'длинный пароль ок')).toBeNull()
  })

  it('секрет группами по 4', () => {
    expect(groupSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP')
  })
})

describe('мок: подключение и вход нового администратора', () => {
  beforeEach(() => sessionStorage.clear())

  it('приглашение → аккаунт → вход; ссылка одноразовая', async () => {
    const token = 'demo-invite-token-0000000000'
    const info = await mockAdmin.inviteInfo(token)
    expect(info.login).toBe('newadmin')
    await expect(mockAdmin.acceptInvite({ token, password: 'short', code: '000000' })).rejects.toThrow(/14/)
    await expect(mockAdmin.acceptInvite({ token, password: 'длинный пароль нового', code: '123456' })).rejects.toThrow(/код/)
    expect((await mockAdmin.acceptInvite({ token, password: 'длинный пароль нового', code: '000000' })).login).toBe('newadmin')
    await expect(mockAdmin.inviteInfo(token)).rejects.toMatchObject({ status: 404 })
    const s = await mockAdmin.login({ login: 'newadmin', password: 'длинный пароль нового', code: '000000' })
    expect(s.login).toBe('newadmin')
  })
})
