// 测试意图识别功能

function analyzeUserIntent(message) {
  const lowerMessage = message.toLowerCase();
  
  // 咨询类关键词
  const inquiryKeywords = [
    '是什么', '什么是', '怎么样', '如何', '为什么', '介绍', '区别', '对比',
    '哪个好', '推荐', '选择', '特点', '功能', '参数', '价格', '评测'
  ];
  
  // 故障类关键词
  const faultKeywords = [
    '无法', '不能', '不转', '黑屏', '卡住', '异常', '故障', '问题', '坏了',
    '没反应', '失灵', '掉高', '中断', '延迟', '鼓包', '异响', '不稳'
  ];
  
  // 判断是否为咨询
  const isInquiry = inquiryKeywords.some(kw => lowerMessage.includes(kw));
  const isFault = faultKeywords.some(kw => lowerMessage.includes(kw));
  
  console.log(`[Intent Analysis] Message: "${message}"`);
  console.log(`[Intent Analysis] isInquiry: ${isInquiry}, isFault: ${isFault}`);
  
  if (isInquiry && !isFault) {
    console.log('[Intent Analysis] Result: inquiry');
    return { type: 'inquiry', topic: message };
  } else if (isFault) {
    console.log('[Intent Analysis] Result: diagnosis (fault detected)');
    return { type: 'diagnosis', topic: message };
  } else {
    // 默认为诊断
    console.log('[Intent Analysis] Result: diagnosis (default)');
    return { type: 'diagnosis', topic: message };
  }
}

// 测试用例
const testCases = [
  'NEO2是什么无人机',
  'Mavic 3无法起飞',
  '推荐一款无人机',
  'Mavic 3和Air 3有什么区别',
  '大疆NEO2怎么样',
  'GPS信号弱',
  '图传黑屏怎么办'
];

console.log('Testing intent analysis...\n');
testCases.forEach(msg => {
  const result = analyzeUserIntent(msg);
  console.log('Result:', result);
  console.log('-'.repeat(50));
});
