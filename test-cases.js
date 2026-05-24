const fs = require('fs');
const path = require('path');

// 读取案例库
const data = fs.readFileSync(
  path.join(__dirname, 'data/fault-cases.json'),
  'utf-8'
);
const faultCases = JSON.parse(data);

console.log('案例库加载成功，共', faultCases.length, '个案例');
console.log('\n第一个案例:');
console.log(JSON.stringify(faultCases[0], null, 2));

// 测试关键词匹配
const symptom = '无法起飞';
const keywords = ['无法起飞', 'GPS信号弱', '电机不转', '图传黑屏', '云台卡住'];

console.log('\n测试匹配:');
console.log('输入症状:', symptom);
console.log('提取关键词:', keywords.filter(k => symptom.includes(k)));

const matchedCases = faultCases.filter(c => {
  return c.keywords.some(keyword => 
    symptom.includes(keyword) || keywords.includes(keyword)
  );
});

console.log('匹配到的案例数:', matchedCases.length);
if (matchedCases.length > 0) {
  console.log('匹配到的案例:', matchedCases.map(c => c.id + ': ' + c.symptom));
}
