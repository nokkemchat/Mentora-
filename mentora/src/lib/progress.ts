import { supabase } from './supabase';

export async function markMaterialComplete(userId: string, materialId: string, subtopicId: string) {
  try {
    const { error } = await supabase
      .from('user_material_progress')
      .upsert(
        { user_id: userId, material_id: materialId, status: 'completed' },
        { onConflict: 'user_id, material_id' }
      );
    
    if (error) throw error;
    
    // Check if subtopic should be mastered
    await checkAndUpdateSubtopicProgress(userId, subtopicId);
    return true;
  } catch (error) {
    console.error('Error marking material complete:', error);
    return false;
  }
}

export async function markQuizComplete(userId: string, subtopicId: string, score: number, passed: boolean) {
  try {
    const { error } = await supabase
      .from('user_quiz_progress')
      .upsert(
        { user_id: userId, subtopic_id: subtopicId, score, passed },
        { onConflict: 'user_id, subtopic_id' }
      );
    
    if (error) throw error;
    
    // Check if subtopic should be mastered
    await checkAndUpdateSubtopicProgress(userId, subtopicId);
    return true;
  } catch (error) {
    console.error('Error marking quiz complete:', error);
    return false;
  }
}

async function checkAndUpdateSubtopicProgress(userId: string, subtopicId: string) {
  try {
    // 1. Get all required materials for this subtopic
    const { data: materials, error: matError } = await supabase
      .from('subtopic_materials')
      .select('id')
      .eq('subtopic_id', subtopicId)
      .eq('is_required', true);
      
    if (matError) throw matError;

    // 2. Get user's completed materials
    const { data: completedMaterials, error: compMatError } = await supabase
      .from('user_material_progress')
      .select('material_id')
      .eq('user_id', userId)
      .eq('status', 'completed');
      
    if (compMatError) throw compMatError;
    
    const completedMatIds = new Set(completedMaterials.map(m => m.material_id));
    
    // Check if all required materials are completed
    let allMaterialsDone = true;
    if (materials && materials.length > 0) {
      allMaterialsDone = materials.every(m => completedMatIds.has(m.id));
    }

    // 3. Check if there are questions (i.e. a quiz exists)
    const { count: questionsCount, error: qError } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('subtopic_id', subtopicId);
      
    if (qError) throw qError;

    let quizDone = true;
    if (questionsCount && questionsCount > 0) {
      // Check if user passed the quiz
      const { data: quizProgress, error: qProgError } = await supabase
        .from('user_quiz_progress')
        .select('passed')
        .eq('user_id', userId)
        .eq('subtopic_id', subtopicId)
        .single();
        
      if (qProgError && qProgError.code !== 'PGRST116') {
        throw qProgError;
      }
      
      quizDone = !!(quizProgress && quizProgress.passed);
    }

    // 4. Update the subtopic progress
    let newStatus = 'In Progress';
    if (allMaterialsDone && quizDone) {
      newStatus = 'Mastered';
    } else if (completedMaterials.length > 0 || (questionsCount && questionsCount > 0 && quizDone)) {
      newStatus = 'In Progress';
    } else {
      newStatus = 'Not Started';
    }

    await supabase
      .from('user_progress')
      .upsert(
        { user_id: userId, subtopic_id: subtopicId, status: newStatus, updated_at: new Date().toISOString() },
        { onConflict: 'user_id, subtopic_id' }
      );
      
  } catch (error) {
    console.error('Error updating subtopic progress:', error);
  }
}
