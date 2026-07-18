-- 1. Create Subscriptions Table
CREATE TABLE public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'cancelled'
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, course_id)
);

-- 2. Create Payments Table
CREATE TABLE public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  phone_number TEXT NOT NULL,
  paynow_reference TEXT UNIQUE NOT NULL, -- Our generated unique reference (e.g. mentora-sub-123)
  paynow_poll_url TEXT, -- URL returned by Paynow to check status manually if needed
  status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending', 'Paid', 'Failed', 'Cancelled'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Set Up Row Level Security (RLS)

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Subscriptions are readable by the owner
CREATE POLICY "Users can view their own subscriptions" 
  ON public.subscriptions FOR SELECT 
  USING (auth.uid() = user_id);

-- Payments are readable by the owner
CREATE POLICY "Users can view their own payments" 
  ON public.payments FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can insert their own payments (to initiate checkout)
CREATE POLICY "Users can insert their own payments" 
  ON public.payments FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Note: The Edge Functions will use the service_role key to update payments and insert subscriptions, which bypasses RLS automatically.
