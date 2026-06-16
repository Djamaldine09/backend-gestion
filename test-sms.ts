import SMSService from './src/services/sms.service';

// Test sans authentification (directement le service)
async function testSMS() {
  console.log('=== Test SMS Orange Developer ===\n');

  // Test 1: Envoi SMS simple
  console.log('Test 1: Envoi SMS simple...');
  const result1 = await SMSService.sendSMS({
    phoneNumber: '0341234567',
    message: 'Test SMS depuis ExamGest',
    senderName: 'ExamGest'
  });
  console.log('Résultat:', result1);

  // Test 2: Notification paiement
  console.log('\nTest 2: Notification paiement...');
  const result2 = await SMSService.sendPaymentNotification({
    phoneNumber: '0341234567',
    candidatName: 'Jean Dupont',
    amount: 50000,
    reference: 'PAY-TEST-001'
  });
  console.log('Résultat:', result2);

  // Test 3: Confirmation inscription
  console.log('\nTest 3: Confirmation inscription...');
  const result3 = await SMSService.sendRegistrationConfirmation({
    phoneNumber: '0341234567',
    candidatName: 'Jean Dupont',
    examCode: 'BAC-2026'
  });
  console.log('Résultat:', result3);

  // Test 4: Rappel examen
  console.log('\nTest 4: Rappel examen...');
  const result4 = await SMSService.sendReminder({
    phoneNumber: '0341234567',
    candidatName: 'Jean Dupont',
    examDate: '2026-07-15 08:00',
    examLocation: 'Lycée Antananarivo'
  });
  console.log('Résultat:', result4);
}

testSMS().catch(console.error);
