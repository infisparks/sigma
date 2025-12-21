-- Insert Fitness Templates into opd_datasets
DELETE FROM opd_datasets WHERE dataname = 'FitnessTemplates';

INSERT INTO opd_datasets (dataname, datajson) VALUES 
('FitnessTemplates', '[
    {
        "id": "d1", "title": "Standard 1500 kcal", "type": "diet", "isAssigned": false,
        "dietEntries": [
            { "timeSlot": "Pre-Breakfast", "description": "Warm water + Lemon, 5 Soaked Almonds" },
            { "timeSlot": "Breakfast", "description": "2 Idli / 1 Dosa with Sambhar (No chutney)" },
            { "timeSlot": "Lunch", "description": "1 Cup Brown Rice, 1 Cup Dal, Green Salad" },
            { "timeSlot": "Evening", "description": "Tea/Coffee (No Sugar), 2 Mari Biscuits" },
            { "timeSlot": "Dinner", "description": "2 Roti, Grilled Veggies/Paneer" }
        ]
    },
    {
        "id": "d2", "title": "Gestational Diabetes", "type": "diet", "isAssigned": false,
        "dietEntries": [
            { "timeSlot": "Breakfast", "description": "Oats Porridge (Unsweetened) or 2 Egg Whites" },
            { "timeSlot": "Mid-Morning", "description": "1 Apple / Guava / Pear" },
            { "timeSlot": "Lunch", "description": "Low GI Rice (1/2 cup), Veggies (2 cups), Dal" },
            { "timeSlot": "Snack", "description": "Roasted Chana / Buttermilk" },
            { "timeSlot": "Dinner", "description": "1 Multigrain Roti, Vegetable Curry, Salad" }
        ]
    },
    {
        "id": "d3", "title": "High Protein / Muscle Gain", "type": "diet", "isAssigned": false,
        "dietEntries": [
            { "timeSlot": "Breakfast", "description": "3 Eggs (Boiled/Scrambled) + Toast or Paneer Bhurji" },
            { "timeSlot": "Lunch", "description": "Grilled Chicken breast / Fish / Soya Chunks + Quinoa" },
            { "timeSlot": "Pre-Workout", "description": "Banana + Peanut Butter" },
            { "timeSlot": "Post-Workout", "description": "Protein Shake / 4 Egg Whites" },
            { "timeSlot": "Dinner", "description": "Lean Meat / Lentil Soup + Salad" }
        ]
    },
    {
        "id": "d4", "title": "Weight Loss (Low Carb)", "type": "diet", "isAssigned": false,
        "dietEntries": [
            { "timeSlot": "Breakfast", "description": "Green Smoothie (Spinach, Cucumber, Apple)" },
            { "timeSlot": "Lunch", "description": "Large Salad Bowl with Olive Oil dressing + Tofu/Chickpeas" },
            { "timeSlot": "Snack", "description": "Green Tea + Walnuts" },
            { "timeSlot": "Dinner", "description": "Clear Soup + Stir-fried Vegetables (No Rice/Roti)" }
        ]
    },
    {
        "id": "d5", "title": "Hypertension (DASH Diet)", "type": "diet", "isAssigned": false,
        "dietEntries": [
            { "timeSlot": "Breakfast", "description": "Oatmeal with skim milk and Banana" },
            { "timeSlot": "Lunch", "description": "Whole wheat pasta with veggies, Curd" },
            { "timeSlot": "Snack", "description": "Fruit Salad (No Chaat Masala/Key Salt)" },
            { "timeSlot": "Dinner", "description": "Baked Fish / Dal, Steamed Broccoli" }
        ]
    },
    {
        "id": "e1", "title": "Basic Cardio", "type": "exercise", "isAssigned": false,
        "exerciseEntries": [
            { "activity": "Walking", "durationMinutes": 30, "note": "Brisk pace, morning or evening" },
            { "activity": "Stretching", "durationMinutes": 10, "note": "Full body stretch" }
        ]
    },
    {
        "id": "e2", "title": "Weight Loss (HIIT)", "type": "exercise", "isAssigned": false,
        "exerciseEntries": [
            { "activity": "Jumping Jacks", "durationMinutes": 5, "note": "Warm up" },
            { "activity": "High Intensity Circuits", "durationMinutes": 20, "note": "Burpees, Mountain Climbers, Squats" },
            { "activity": "Cool Down Walk", "durationMinutes": 10, "note": "Slow pace" }
        ]
    },
    {
        "id": "e3", "title": "Yoga for Beginners", "type": "exercise", "isAssigned": false,
        "exerciseEntries": [
            { "activity": "Surya Namaskar", "durationMinutes": 15, "note": "5-10 repetitions slow pace" },
            { "activity": "Pranayama", "durationMinutes": 10, "note": "Breathing exercises" },
            { "activity": "Meditation", "durationMinutes": 5, "note": "Mindfulness" }
        ]
    },
    {
        "id": "e4", "title": "Strength Training", "type": "exercise", "isAssigned": false,
        "exerciseEntries": [
            { "activity": "Push-ups", "durationMinutes": 10, "note": "3 sets of 10" },
            { "activity": "Bodyweight Squats", "durationMinutes": 10, "note": "3 sets of 15" },
            { "activity": "Plank", "durationMinutes": 5, "note": "Hold as long as possible" }
        ]
    },
    {
        "id": "e5", "title": "Senior Citizen Mobility", "type": "exercise", "isAssigned": false,
        "exerciseEntries": [
            { "activity": "Chair Yoga", "durationMinutes": 15, "note": "Gentle stretching while seated" },
            { "activity": "Slow Walking", "durationMinutes": 20, "note": "Flat surface only" },
            { "activity": "Joint Rotations", "durationMinutes": 10, "note": "Neck, Shoulders, Ankles" }
        ]
    }
]');
