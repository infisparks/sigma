const DB_NAME = "HospitalAppDB";
const DB_VERSION = 1;
const STORE_NAME = "settings";
const HOSPITAL_KEY = "selectedHospital";
const DOCTOR_KEY = "selectedTreatingDoctorId";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return reject(new Error("IndexedDB is not supported"));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Saves the selected clinic/hospital to IndexedDB (and localStorage as fallback)
 */
export async function saveHospitalToDB(hospitalName: string): Promise<void> {
  if (!hospitalName) return;

  // Sync to localStorage for fast synchronous fallback
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("selectedHospital", hospitalName);
    } catch (e) {
      console.warn("localStorage write failed:", e);
    }
  }

  // Save to IndexedDB
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(hospitalName, HOSPITAL_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("IndexedDB save failed:", err);
  }
}

/**
 * Retrieves the saved clinic/hospital from IndexedDB (falling back to localStorage)
 */
export async function getHospitalFromDB(): Promise<string | null> {
  // Try IndexedDB first
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(HOSPITAL_KEY);

    const val = await new Promise<string | null>((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });

    if (val) return val;
  } catch (err) {
    console.warn("IndexedDB read failed, falling back to localStorage:", err);
  }

  // Fallback to localStorage
  if (typeof window !== "undefined") {
    try {
      return localStorage.getItem("selectedHospital");
    } catch (e) {
      return null;
    }
  }

  return null;
}

/**
 * Saves the selected treating doctor ID to IndexedDB (and localStorage as fallback)
 */
export async function saveDoctorToDB(doctorId: string | number): Promise<void> {
  if (!doctorId) return;
  const strId = String(doctorId);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("selectedTreatingDoctorId", strId);
    } catch (e) {
      console.warn("localStorage write failed:", e);
    }
  }

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(strId, DOCTOR_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("IndexedDB doctor save failed:", err);
  }
}

/**
 * Retrieves the saved treating doctor ID from IndexedDB (falling back to localStorage)
 */
export async function getDoctorFromDB(): Promise<string | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(DOCTOR_KEY);

    const val = await new Promise<string | null>((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });

    if (val) return val;
  } catch (err) {
    console.warn("IndexedDB doctor read failed, falling back to localStorage:", err);
  }

  if (typeof window !== "undefined") {
    try {
      return localStorage.getItem("selectedTreatingDoctorId");
    } catch (e) {
      return null;
    }
  }

  return null;
}
