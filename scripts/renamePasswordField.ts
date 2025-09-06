import dbConnect from '@/lib/mongodb';
import Employee from '@/models/Employee';

(async () => {
  try {
    await dbConnect();
    const result = await Employee.updateMany(
      {},
      { $rename: { 'password': 'passwordHash' } }
    );
    console.log('Field renamed:', result);
    process.exit();
  } catch (err) {
    console.error('Error renaming field:', err);
    process.exit(1);
  }
})();
