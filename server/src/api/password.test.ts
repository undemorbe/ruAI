import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.ts'

test('scrypt: верный пароль проходит, неверный нет, соль разная', async () => {
  const a = await hashPassword('correct horse')
  const b = await hashPassword('correct horse')
  assert.match(a, /^scrypt\$32768\$8\$1\$[\w-]{22}\$[\w-]{43}$/)
  assert.notEqual(a, b)
  assert.equal(await verifyPassword('correct horse', a), true)
  assert.equal(await verifyPassword('correct hors', a), false)
})

test('битый, «!», чужие параметры и фиктивный хэш никогда не проходят', async () => {
  assert.equal(await verifyPassword('x', '!'), false)
  assert.equal(await verifyPassword('x', 'scrypt$1$1$1$a$b'), false)
  const real = await hashPassword('x')
  assert.equal(await verifyPassword('x', real.replace('$32768$', '$1048576$')), false, 'N из БД не поднимает нагрузку')
  assert.equal(await verifyPassword('anything', DUMMY_HASH), false)
})
