// Anonymous format fixture, not a prescribed workout or user data.
export function demoRoot() {
  const program = (id, title) => ({
    programId: id, name: title, source: 'synthetic-storage-test', currentIndex: 0, currentWorkoutId: id + '-day',
    days: [{workoutId: id + '-day', title: '示例训练', plannedDate: '2026-01-01', exercises: [
      {exerciseId: id + '-exercise', trackingName: '测试动作', name: '测试动作', section: '主项',
        prescription: {setType: 'working', targetWeight: 60}, sets: [
          {setId: id + '-set', weight: '', weightKg: 0, reps: '5', rir: '3', rest: 180, completed: false}
        ]}
    ], activities: [{activityId: id + '-activity', activityType: 'warmup', segments: [{label: '测试准备', duration: 30}]}]}],
    workoutLogs: [{logId: id + '-log', actualDate: '2026-01-02', note: '历史备注', entries: [
      {exerciseId: id + '-exercise', setId: id + '-set', trackingName: '测试动作', weight: '60', weightKg: 60, reps: '5', rir: '3', unit: 'kg'}
    ]}],
    exerciseHistory: {'测试动作': [{date: '2026-01-02', sets: [{weightKg: 60, reps: 5, rir: 3}]}]},
    actualDates: {[id + '-day']: '2026-01-02'}, dateAnchors: {[id + '-day']: '2026-01-02'},
    sessionStartedAt: {[id + '-day']: '2026-01-02T10:00:00Z'}, completed: {[id + '-day']: true},
    currentWorkoutDrafts: {[id + '-day']: {exercises: [{exerciseId: id + '-exercise', sets: [{setId: id + '-set', weight: '62.5', reps: '5', rir: '2'}]}]}},
    currentSessionNote: '当前备注', noteArchive: [{text: '归档备注'}], settings: {mainRest: 180}
  });
  return {schemaVersion: 6, activeProfileId: 'demo-profile', activeProgramId: 'demo-one', profiles: {
    'demo-profile': {profileId: 'demo-profile', name: '匿名测试', programs: {
      'demo-one': program('demo-one', '示例计划一'), 'demo-two': program('demo-two', '示例计划二')
    }, exerciseTemplates: [{name: '测试动作'}], warmupTemplates: [{name: '测试热身'}], rmRecords: [{weight: 60, reps: 5}]}
  }, ui: {}, futureOptionalField: {preserved: true}};
}
