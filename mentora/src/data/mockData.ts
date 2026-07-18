export type Option = {
  id: string;
  text: string;
  isCorrect: boolean;
};

export type Question = {
  id: string;
  text: string;
  options: Option[];
  explanation: string;
};

export type ResourceStatus = 'Not Started' | 'In Progress' | 'Mastered' | 'Needs Revision';

export type Subtopic = {
  id: string;
  title: string;
  status: ResourceStatus;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  estimatedTime: string;
  videoUrl?: string;
  notesContent?: string;
  questions: Question[];
  pastPapersCount?: number;
};

export type Topic = {
  id: string;
  title: string;
  subtopics: Subtopic[];
};

export type Course = {
  id: string;
  title: string;
  board: 'ZIMSEC' | 'Cambridge';
  level: 'O-Level' | 'A-Level';
  icon: string;
  color: string;
  topics: Topic[];
};

export const mockCourses: Course[] = [
  {
    id: 'zimsec-o-math',
    title: 'Mathematics',
    board: 'ZIMSEC',
    level: 'O-Level',
    icon: 'calculator-variant',
    color: '#208AEF',
    topics: [
      {
        id: 't-algebra',
        title: 'Algebra',
        subtopics: [
          {
            id: 'st-linear-eq',
            title: 'Linear Equations',
            status: 'Mastered',
            difficulty: 'Easy',
            estimatedTime: '30 mins',
            pastPapersCount: 12,
            questions: []
          },
          {
            id: 'st-quadratic-eq',
            title: 'Quadratic Equations',
            status: 'In Progress',
            difficulty: 'Medium',
            estimatedTime: '45 mins',
            pastPapersCount: 24,
            questions: [
              {
                id: 'q1',
                text: 'Factorise: x^2 + 5x + 6',
                options: [
                  { id: 'o1', text: '(x + 2)(x + 3)', isCorrect: true },
                  { id: 'o2', text: '(x - 2)(x - 3)', isCorrect: false },
                  { id: 'o3', text: '(x + 1)(x + 6)', isCorrect: false },
                  { id: 'o4', text: '(x - 1)(x - 6)', isCorrect: false },
                ],
                explanation: 'We need two numbers that multiply to 6 and add to 5. Those numbers are 2 and 3.'
              }
            ]
          },
          {
            id: 'st-algebraic-fractions',
            title: 'Algebraic Fractions',
            status: 'Needs Revision',
            difficulty: 'Hard',
            estimatedTime: '60 mins',
            pastPapersCount: 18,
            questions: []
          }
        ]
      },
      {
        id: 't-geometry',
        title: 'Geometry',
        subtopics: [
          {
            id: 'st-circle-geometry',
            title: 'Circle Geometry',
            status: 'Not Started',
            difficulty: 'Hard',
            estimatedTime: '90 mins',
            pastPapersCount: 30,
            questions: [
              {
                id: 'q2',
                text: 'The angle subtended by an arc at the centre is...',
                options: [
                  { id: 'o1', text: 'equal to the angle at the circumference.', isCorrect: false },
                  { id: 'o2', text: 'half the angle at the circumference.', isCorrect: false },
                  { id: 'o3', text: 'twice the angle at the circumference.', isCorrect: true },
                  { id: 'o4', text: 'complementary to the angle at the circumference.', isCorrect: false },
                ],
                explanation: 'A fundamental theorem of circle geometry: the angle at the centre is twice the angle at the circumference subtended by the same arc.'
              }
            ]
          },
          {
            id: 'st-polygons',
            title: 'Polygons',
            status: 'Not Started',
            difficulty: 'Medium',
            estimatedTime: '40 mins',
            pastPapersCount: 15,
            questions: []
          }
        ]
      },
      {
        id: 't-trigonometry',
        title: 'Trigonometry',
        subtopics: [
          {
            id: 'st-right-angled-triangles',
            title: 'Right-Angled Triangles (SOH CAH TOA)',
            status: 'Not Started',
            difficulty: 'Medium',
            estimatedTime: '50 mins',
            pastPapersCount: 22,
            questions: []
          },
          {
            id: 'st-sine-cosine-rules',
            title: 'Sine and Cosine Rules',
            status: 'Not Started',
            difficulty: 'Hard',
            estimatedTime: '70 mins',
            pastPapersCount: 28,
            questions: []
          }
        ]
      }
    ]
  },
  {
    id: 'zimsec-o-science',
    title: 'Combined Science',
    board: 'ZIMSEC',
    level: 'O-Level',
    icon: 'flask',
    color: '#1CA464',
    topics: [
      {
        id: 't-biology',
        title: 'Biology Section',
        subtopics: [
          {
            id: 'st-cells',
            title: 'Cell Biology',
            status: 'Mastered',
            difficulty: 'Easy',
            estimatedTime: '40 mins',
            questions: []
          }
        ]
      }
    ]
  }
];

export type ChatMessage = {
  id: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  timestamp: string;
  isCurrentUser: boolean;
};

export type Participant = {
  id: string;
  name: string;
  studyTimeMinutes: number;
  isHost: boolean;
};

export type StudyRoom = {
  id: string;
  title: string;
  subject: string;
  type: 'Public' | 'School';
  participantCount: number;
  maxParticipants: number;
  isFocusMode: boolean;
  participants: Participant[];
  chatHistory: ChatMessage[];
};

export const mockStudyRooms: StudyRoom[] = [
  {
    id: 'room-1',
    title: 'O-Level Math Revision 📚',
    subject: 'Mathematics',
    type: 'Public',
    participantCount: 12,
    maxParticipants: 50,
    isFocusMode: false,
    participants: [
      { id: 'p1', name: 'Tinashe', studyTimeMinutes: 120, isHost: true },
      { id: 'p2', name: 'Sarah', studyTimeMinutes: 45, isHost: false },
      { id: 'p3', name: 'You', studyTimeMinutes: 0, isHost: false },
    ],
    chatHistory: [
      { id: 'm1', senderName: 'Tinashe', text: 'Hey everyone! We are focusing on Circle Geometry today.', timestamp: '10:00 AM', isCurrentUser: false },
      { id: 'm2', senderName: 'Sarah', text: 'Awesome, I really need help with theorems.', timestamp: '10:02 AM', isCurrentUser: false },
    ]
  },
  {
    id: 'room-2',
    title: 'St. Georges College Only',
    subject: 'Combined Science',
    type: 'School',
    participantCount: 4,
    maxParticipants: 20,
    isFocusMode: true,
    participants: [
      { id: 'p4', name: 'David', studyTimeMinutes: 60, isHost: true },
      { id: 'p5', name: 'Michael', studyTimeMinutes: 30, isHost: false },
    ],
    chatHistory: [
      { id: 'm3', senderName: 'David', text: 'Focus mode is ON. No chatting until the break!', timestamp: '09:00 AM', isCurrentUser: false },
    ]
  }
];

export type TeacherCourseStat = {
  id: string;
  courseId: string;
  title: string;
  activeStudents: number;
  revenueGenerated: number;
  rating: number;
  status: 'Published' | 'Draft';
};

export type TeacherStats = {
  totalRevenue: number;
  pendingPayout: number;
  totalStudents: number;
  averageRating: number;
  courses: TeacherCourseStat[];
};

export const mockTeacherStats: TeacherStats = {
  totalRevenue: 1250.00,
  pendingPayout: 350.00,
  totalStudents: 145,
  averageRating: 4.8,
  courses: [
    {
      id: 'tc-1',
      courseId: 'zimsec-o-math',
      title: 'Mathematics (O-Level)',
      activeStudents: 85,
      revenueGenerated: 850.00,
      rating: 4.9,
      status: 'Published'
    },
    {
      id: 'tc-2',
      courseId: 'zimsec-o-science',
      title: 'Combined Science Masterclass',
      activeStudents: 60,
      revenueGenerated: 400.00,
      rating: 4.7,
      status: 'Published'
    }
  ]
};

export type RequiredSubject = {
  subject: string;
  level: 'O-Level' | 'A-Level';
  minimumGrade: string;
};

export type CareerRoadmapStep = {
  title: string;
  duration: string;
  description: string;
};

export type CareerPath = {
  id: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  expectedSalaryEntry: number;
  expectedSalarySenior: number;
  demandLevel: 'High' | 'Medium' | 'Low';
  requiredSubjects: RequiredSubject[];
  roadmap: CareerRoadmapStep[];
};

export type University = {
  id: string;
  name: string;
  location: string;
  image: string;
  topPrograms: string[];
};

export const mockCareers: CareerPath[] = [
  {
    id: 'career-swe',
    title: 'Software Engineer',
    icon: 'monitor',
    color: '#3B82F6',
    description: 'Design, develop, and maintain software systems and applications.',
    expectedSalaryEntry: 35000,
    expectedSalarySenior: 120000,
    demandLevel: 'High',
    requiredSubjects: [
      { subject: 'Mathematics', level: 'A-Level', minimumGrade: 'B' },
      { subject: 'Computer Science', level: 'A-Level', minimumGrade: 'C' },
      { subject: 'Physics', level: 'A-Level', minimumGrade: 'C' }
    ],
    roadmap: [
      { title: 'A-Levels', duration: '2 Years', description: 'Focus heavily on Mathematics and Sciences.' },
      { title: 'BSc Computer Science', duration: '3-4 Years', description: 'Attend university to get a formal degree in CS.' },
      { title: 'Junior Developer Role', duration: '1-3 Years', description: 'Entry level position to gain industry experience.' }
    ]
  },
  {
    id: 'career-med',
    title: 'Medical Doctor',
    icon: 'activity',
    color: '#EF4444',
    description: 'Diagnose and treat illnesses and injuries in patients.',
    expectedSalaryEntry: 45000,
    expectedSalarySenior: 180000,
    demandLevel: 'High',
    requiredSubjects: [
      { subject: 'Chemistry', level: 'A-Level', minimumGrade: 'A' },
      { subject: 'Biology', level: 'A-Level', minimumGrade: 'A' },
      { subject: 'Mathematics or Physics', level: 'A-Level', minimumGrade: 'B' }
    ],
    roadmap: [
      { title: 'A-Levels', duration: '2 Years', description: 'Achieve top grades in Chemistry and Biology.' },
      { title: 'Medical School (MBChB)', duration: '5 Years', description: 'Rigorous medical training at a recognized university.' },
      { title: 'Housemanship', duration: '2 Years', description: 'Supervised clinical training in hospitals.' }
    ]
  }
];

export const mockUniversities: University[] = [
  {
    id: 'uni-uz',
    name: 'University of Zimbabwe',
    location: 'Harare',
    image: 'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&q=80&w=400',
    topPrograms: ['Medicine', 'Law', 'Engineering']
  },
  {
    id: 'uni-nust',
    name: 'NUST',
    location: 'Bulawayo',
    image: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&q=80&w=400',
    topPrograms: ['Computer Science', 'Actuarial Science', 'Architecture']
  }
];
