const xrayPriceList = [
    {
      "SrNo": 1,
      "Examination": "CHEST PA",
      "Views": 1,
      "OPD_Amt": 250,
      "Portable": 500
    },
    {
      "SrNo": 2,
      "Examination": "CHEST AP,PA,LAT,OBL",
      "Views": "PER VIEW",
      "OPD_Amt": 250,
      "Portable": 500
    },
    {
      "SrNo": 3,
      "Examination": "ABDOMEN AP",
      "Views": 1,
      "OPD_Amt": 250,
      "Portable": 500
    },
    {
      "SrNo": 4,
      "Examination": "KUB",
      "Views": 2,
      "OPD_Amt": 450,
      "Portable": 600
    },
    {
      "SrNo": 5,
      "Examination": "SKULL AP/ LAT",
      "Views": 2,
      "OPD_Amt": 450,
      "Portable": 600
    },
    {
      "SrNo": 6,
      "Examination": "MASTOID",
      "Views": 1,
      "OPD_Amt": 250,
      "Portable": 500
    },
    {
      "SrNo": 7,
      "Examination": "ADENOID",
      "Views": 1,
      "OPD_Amt": 250,
      "Portable": 500
    },
    {
      "SrNo": 8,
      "Examination": "NASAL BONE",
      "Views": 1,
      "OPD_Amt": 250,
      "Portable": 500
    },
    {
      "SrNo": 9,
      "Examination": "NASOPHRANX",
      "Views": 1,
      "OPD_Amt": 250,
      "Portable": 500
    },
    {
      "SrNo": 10,
      "Examination": "TM JOINT LAT",
      "Views": 1,
      "OPD_Amt": 250,
      "Portable": 500
    },
    {
      "SrNo": 11,
      "Examination": "TM JOINT AP/LAT",
      "Views": 2,
      "OPD_Amt": 450,
      "Portable": 600
    },
    {
      "SrNo": 12,
      "Examination": "PNS",
      "Views": 1,
      "OPD_Amt": 250,
      "Portable": 500
    },
    {
      "SrNo": 13,
      "Examination": "PNS (WATERS/COLDWELL)",
      "Views": 2,
      "OPD_Amt": 450,
      "Portable": 600
    },
    {
      "SrNo": 14,
      "Examination": "CERVICA SPINE AP",
      "Views": 1,
      "OPD_Amt": 250,
      "Portable": 500
    },
    {
      "SrNo": 15,
      "Examination": "SHOULDER JNT AP",
      "Views": 1,
      "OPD_Amt": 250,
      "Portable": 500
    },
    {
      "SrNo": 16,
      "Examination": "SHOULDER JNT AP/LAT",
      "Views": 2,
      "OPD_Amt": 400,
      "Portable": 600
    },
    {
      "SrNo": 17,
      "Examination": "DORSAL SPINE AP/LAT",
      "Views": 2,
      "OPD_Amt": 450,
      "Portable": 600
    },
    {
      "SrNo": 18,
      "Examination": "LUMBAR SPINE AP/LAT",
      "Views": 2,
      "OPD_Amt": 450,
      "Portable": 600
    },
    {
      "SrNo": 19,
      "Examination": "LUMBAR SPINE FLX/EXT",
      "Views": 2,
      "OPD_Amt": 450,
      "Portable": 600
    },
    {
      "SrNo": 20,
      "Examination": "SACRUM-COCCYX AP/LAT",
      "Views": 2,
      "OPD_Amt": 450,
      "Portable": 600
    },
    {
      "SrNo": 21,
      "Examination": "PBH-AP",
      "Views": 1,
      "OPD_Amt": 250,
      "Portable": 500
    },
    {
      "SrNo": 22,
      "Examination": "PBH AP/LAT",
      "Views": 2,
      "OPD_Amt": 450,
      "Portable": 600
    },
    {
      "SrNo": 23,
      "Examination": "PRH AP/LAT VIEW (BOTH)",
      "Views": 4,
      "OPD_Amt": 800,
      "Portable": 1000
    },
    {
      "SrNo": 24,
      "Examination": "FEMUR AP/LAT",
      "Views": 2,
      "OPD_Amt": 450,
      "Portable": 600
    },
    {
      "SrNo": 25,
      "Examination": "FEMUR AP/LAT BOTH",
      "Views": 4,
      "OPD_Amt": 800,
      "Portable": 1000
    },
    {
      "SrNo": 26,
      "Examination": "KNEE JOINT AP/LAT",
      "Views": 2,
      "OPD_Amt": 400,
      "Portable": 600
    },
    {
      "SrNo": 27,
      "Examination": "KNEE JOINT AP/LAT BOTH",
      "Views": 4,
      "OPD_Amt": 800,
      "Portable": 1000
    },
    {
      "SrNo": 28,
      "Examination": "KNEE JOINT SKYLINE BOTH",
      "Views": 2,
      "OPD_Amt": 500,
      "Portable": 700
    },
    {
      "SrNo": 29,
      "Examination": "LEG AP/LAT",
      "Views": 2,
      "OPD_Amt": 400,
      "Portable": 600
    },
    {
      "SrNo": 30,
      "Examination": "LEG AP/LAT BOTH",
      "Views": 4,
      "OPD_Amt": 800,
      "Portable": 1000
    },
    {
      "SrNo": 31,
      "Examination": "ANKLE AP/LAT",
      "Views": 2,
      "OPD_Amt": 400,
      "Portable": 600
    },
    {
      "SrNo": 32,
      "Examination": "ANKLE AP/LAT BOTH",
      "Views": 4,
      "OPD_Amt": 800,
      "Portable": 1000
    },
    {
      "SrNo": 33,
      "Examination": "FOOT AP/LAT",
      "Views": 2,
      "OPD_Amt": 400,
      "Portable": 600
    },
    {
      "SrNo": 34,
      "Examination": "FOOT AP/LAT BOTH",
      "Views": 4,
      "OPD_Amt": 800,
      "Portable": 1000
    },
    {
      "SrNo": 35,
      "Examination": "TOE AP/LAT",
      "Views": 2,
      "OPD_Amt": 400,
      "Portable": 600
    },
    {
      "SrNo": 36,
      "Examination": "HAND AP/LAT",
      "Views": 2,
      "OPD_Amt": 400,
      "Portable": 600
    },
    {
      "SrNo": 37,
      "Examination": "ELBOW AP/LAT",
      "Views": 2,
      "OPD_Amt": 400,
      "Portable": 600
    },
    {
      "SrNo": 38,
      "Examination": "FOREARM AP/LAT",
      "Views": 2,
      "OPD_Amt": 400,
      "Portable": 600
    },
    {
      "SrNo": 39,
      "Examination": "FINGER AP/LAT",
      "Views": 2,
      "OPD_Amt": 400,
      "Portable": 600
    }
  ];
  
  const procedureList = [
    {
      "Procedure": "HSG",
      "Amount": 3000
    },
    {
      "Procedure": "IVP",
      "Amount": 3000
    },
    {
      "Procedure": "BMFT",
      "Amount": 2000
    },
    {
      "Procedure": "BM SWALLOW",
      "Amount": 1000
    }
  ];
  
  export { xrayPriceList, procedureList };
  