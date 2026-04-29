const XLSX = require('xlsx');
const fs = require('fs');

try {
  // 读取测试用的模板文件
  const buf = fs.readFileSync('/Users/sunji/Desktop/bom-模板-26.04.29（修改后）.xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  console.log('Excel 读取成功，共', rows.length, '行');

  // 从 bomCheck.js 提取相关函数
  const code = fs.readFileSync('src/routes/bomCheck.js', 'utf-8');

  // 提取所有需要的辅助函数和校验函数
  const helperFuncs = `
  function cellStr(val) {
    if (val == null) return '';
    return String(val).trim().replace(/\\s+/g, '').replace(/[（(].*?[)）]/g, '');
  }
  function rowHasKeywords(row, keywords) {
    const cells = row.map(cellStr);
    return keywords.map(kw => {
      const cleanKw = kw.replace(/\\s+/g, '');
      return cells.some(c => c.includes(cleanKw));
    });
  }
  const COL_NAME = 2;
  const COL_BRAND = 3;
  const COL_WEIGHT = 4;
  const COL_TAX_PRICE = 5;
  const COL_EX_PRICE = 6;
  const COL_COST = 7;
  const COL_PERCENT = 8;
  function isEmptyCell(val) {
    if (val == null || val === undefined) return true;
    const str = String(val).trim();
    if (str === '' || str === '-' || str.startsWith('#')) return true;
    return false;
  }
  function hasValue(val) {
    return !isEmptyCell(val);
  }
  `;

  // 提取 validateTemplateHeaders
  const headerMatch = code.match(/function validateTemplateHeaders\(rows\) \{[\s\S]*?\n\}\n\nfunction validateTemplateData/);
  // 提取 validateTemplateData
  const dataMatch = code.match(/function validateTemplateData\(rows, headerDetails\) \{[\s\S]*?\n\}\n\nfunction parseAuditSheet/);

  if (!headerMatch || !dataMatch) {
    console.log('未找到校验函数');
    console.log('headerMatch:', !!headerMatch);
    console.log('dataMatch:', !!dataMatch);
    process.exit(1);
  }

  const execCode = helperFuncs + headerMatch[0].replace('\n\nfunction validateTemplateData', '') + '\n' + dataMatch[0].replace('\n\nfunction parseAuditSheet', '');

  eval(execCode);

  // 测试1：正常模板应该通过
  console.log('\n=== 测试1：正常模板 ===');
  const headerResult = validateTemplateHeaders(rows);
  console.log('表头校验:', headerResult.valid ? '通过' : '失败');
  if (!headerResult.valid) {
    headerResult.errors.forEach(e => console.log('  -', e));
  }
  if (headerResult.valid) {
    const dataResult = validateTemplateData(rows, headerResult.details);
    console.log('数据校验:', dataResult.valid ? '通过' : '失败');
    if (!dataResult.valid) {
      dataResult.errors.forEach(e => console.log('  -', e));
    }
  }

  // 测试2：修改一个原料行的重量为空
  console.log('\n=== 测试2：原料行重量为空 ===');
  const rows2 = JSON.parse(JSON.stringify(rows));
  rows2[3][COL_WEIGHT] = '';
  const headerResult2 = validateTemplateHeaders(rows2);
  if (headerResult2.valid) {
    const dataResult2 = validateTemplateData(rows2, headerResult2.details);
    console.log('数据校验:', dataResult2.valid ? '通过' : '失败');
    dataResult2.errors.forEach(e => console.log('  -', e));
  }

  // 测试3：修改产品名称为空
  console.log('\n=== 测试3：产品名称为空 ===');
  const rows3 = JSON.parse(JSON.stringify(rows));
  for (let i = 0; i < rows3.length; i++) {
    const cell0 = String(rows3[i][0] || '').trim();
    if (cell0.includes('产品名称')) {
      rows3[i][COL_NAME] = '';
      break;
    }
  }
  const headerResult3 = validateTemplateHeaders(rows3);
  if (headerResult3.valid) {
    const dataResult3 = validateTemplateData(rows3, headerResult3.details);
    console.log('数据校验:', dataResult3.valid ? '通过' : '失败');
    dataResult3.errors.forEach(e => console.log('  -', e));
  }

  // 测试4：BOM成本合计中人工费用金额为空
  console.log('\n=== 测试4：人工费用金额为空 ===');
  const rows4 = JSON.parse(JSON.stringify(rows));
  for (let i = 0; i < rows4.length; i++) {
    const cell0 = String(rows4[i][0] || '').trim();
    if (cell0.includes('人工费用')) {
      rows4[i][COL_COST] = '';
      rows4[i][COL_PERCENT] = '';
      break;
    }
  }
  const headerResult4 = validateTemplateHeaders(rows4);
  if (headerResult4.valid) {
    const dataResult4 = validateTemplateData(rows4, headerResult4.details);
    console.log('数据校验:', dataResult4.valid ? '通过' : '失败');
    dataResult4.errors.forEach(e => console.log('  -', e));
  }

  console.log('\n所有测试完成');
} catch (err) {
  console.error('错误:', err.message);
  console.error(err.stack);
}
