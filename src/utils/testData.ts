import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase/config';

export const createTestUsers = async () => {
  try {
    // Admin kullanıcı oluştur
    const adminCredential = await createUserWithEmailAndPassword(auth, 'admin@test.com', 'admin123');
    await setDoc(doc(db, 'users', adminCredential.user.uid), {
      email: 'admin@test.com',
      role: 'depo',
      name: 'Admin Kullanıcı',
      createdAt: new Date()
    });

    // Şöför kullanıcı oluştur
    const driverCredential = await createUserWithEmailAndPassword(auth, 'sofor@test.com', 'sofor123');
    await setDoc(doc(db, 'users', driverCredential.user.uid), {
      email: 'sofor@test.com',
      role: 'sofor',
      name: 'Ahmet Yılmaz',
      createdAt: new Date()
    });

    console.log('Test kullanıcıları oluşturuldu!');
  } catch (error) {
    console.error('Test kullanıcıları oluşturulurken hata:', error);
  }
};
