async function testDiagnosis() {
  try {
    console.log('Testing diagnosis API...\n');
    
    // 测试1: 案例匹配测试
    console.log('=== Test 1: Case Matching ===');
    const testResponse = await fetch('http://localhost:3000/api/diagnosis/test?symptom=无法起飞');
    const testData = await testResponse.json();
    console.log('Test endpoint result:', JSON.stringify(testData, null, 2));
    
    // 测试2: 完整诊断
    console.log('\n=== Test 2: Full Diagnosis ===');
    const diagResponse = await fetch('http://localhost:3000/api/diagnosis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symptom: '无法起飞' })
    });
    const diagData = await diagResponse.json();
    console.log('Diagnosis result:', JSON.stringify(diagData, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testDiagnosis();
