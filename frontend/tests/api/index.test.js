/**
 * API 模块测试
 * 验证 API 接口定义的完整性（不实际发请求）
 */

import { describe, test, expect } from 'vitest'
import {
  authApi, userApi, productApi, priceApi,
  materialApi, logApi, backupApi, bomCheckApi,
  recipeImportApi, calculatorImportApi, calculatorApi,
  matchCorrectionApi
} from '../../src/api'

describe('API 模块完整性', () => {
  test('authApi - 包含 login 和 changePassword', () => {
    expect(typeof authApi.login).toBe('function')
    expect(typeof authApi.changePassword).toBe('function')
  })

  test('userApi - 包含完整 CRUD 方法', () => {
    expect(typeof userApi.getList).toBe('function')
    expect(typeof userApi.create).toBe('function')
    expect(typeof userApi.updateStatus).toBe('function')
    expect(typeof userApi.updateRole).toBe('function')
    expect(typeof userApi.resetPassword).toBe('function')
  })

  test('productApi - 包含完整 CRUD 方法', () => {
    expect(typeof productApi.getList).toBe('function')
    expect(typeof productApi.getTypes).toBe('function')
    expect(typeof productApi.create).toBe('function')
    expect(typeof productApi.update).toBe('function')
    expect(typeof productApi.delete).toBe('function')
  })

  test('priceApi - 包含查询、创建、删除方法', () => {
    expect(typeof priceApi.getList).toBe('function')
    expect(typeof priceApi.create).toBe('function')
    expect(typeof priceApi.delete).toBe('function')
  })

  test('materialApi - 包含全部统计接口', () => {
    expect(typeof materialApi.getList).toBe('function')
    expect(typeof materialApi.getStats).toBe('function')
    expect(typeof materialApi.getSupplierStats).toBe('function')
    expect(typeof materialApi.getBrandStats).toBe('function')
  })

  test('logApi - 包含查询和记录接口', () => {
    expect(typeof logApi.getList).toBe('function')
    expect(typeof logApi.add).toBe('function')
  })

  test('backupApi - 包含列表、创建、恢复接口', () => {
    expect(typeof backupApi.getList).toBe('function')
    expect(typeof backupApi.create).toBe('function')
    expect(typeof backupApi.restore).toBe('function')
  })

  test('bomCheckApi - 包含检查接口', () => {
    expect(typeof bomCheckApi.check).toBe('function')
  })

  test('recipeImportApi - 包含导入接口', () => {
    expect(typeof recipeImportApi.import).toBe('function')
  })

  test('calculatorImportApi - 包含导入和模板下载接口', () => {
    expect(typeof calculatorImportApi.import).toBe('function')
    expect(typeof calculatorImportApi.downloadTemplate).toBe('function')
  })

  test('calculatorApi - 包含计算接口', () => {
    expect(typeof calculatorApi.calculate).toBe('function')
  })

  test('matchCorrectionApi - 包含保存接口', () => {
    expect(typeof matchCorrectionApi.save).toBe('function')
  })
})
