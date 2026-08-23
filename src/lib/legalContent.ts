/**
 * The actual text of the User Agreement and Privacy Policy — a direct,
 * word-for-word port of the web repo's src/lib/legalContent.ts. Kept
 * identical on purpose: a legal document that says one thing on the
 * website and another in the app is worse than having none. If the web
 * copy changes, this file must change with it.
 *
 * reviewNote fields are intentionally omitted from this port — they're
 * PDF-only notes for the reviewing lawyer on the web side and were never
 * meant to reach a customer-facing screen.
 */

export type LegalSection = {
  heading: string;
  /** Each string is one paragraph. */
  body: string[];
};

export type LegalDocument = {
  title: string;
  intro: string[];
  sections: LegalSection[];
};

const PLATFORM_FEE_DISPLAY = '5%';
const CANCELLATION_WINDOW = '48 hours';
const RESCHEDULE_WINDOW = '24 hours';

export const TERMS: LegalDocument = {
  title: 'User Agreement',
  intro: [
    'AIR/Rally is an online marketplace for discovering and booking pickleball courts in the Philippines. These terms govern your use of air-rally.com and any AIR/Rally application.',
    'By creating an account, you accept this agreement. If you do not accept it, do not create an account or make a booking.',
  ],
  sections: [
    {
      heading: '1. What AIR/Rally is, and what it is not',
      body: [
        'AIR/Rally connects players with venues that operate pickleball courts. Venues are independent businesses. They own and control their courts, set their own prices and opening hours, and are responsible for the condition, safety, staffing and lawful operation of their facilities.',
        "When you book, your agreement to use the court is with the venue. AIR/Rally is not the operator of the court, not a party to that agreement, and does not supervise play. AIR/Rally's role is to list availability, take the booking, collect payment, and give both sides a record of it.",
      ],
    },
    {
      heading: '2. Your account',
      body: [
        'You must be able to enter a binding contract to hold an account. You are responsible for what happens under your account and for keeping your password private.',
        'You give a first name, last name and email address at signup. You may add a display name, a profile photo and a phone number. Your display name and profile photo are visible to other users.',
        'Accounts begin as player accounts. Becoming a venue owner requires submitting an application and being approved by AIR/Rally; you cannot grant yourself venue-owner or administrator access.',
      ],
    },
    {
      heading: '3. Booking a court',
      body: [
        'A booking is held from the moment it is created and becomes confirmed once payment succeeds. A court cannot be double-booked: the first booking to take a time slot holds it, including while payment is still pending.',
        'Bookings must start at least 30 minutes in the future and may run up to 4 hours. Availability shown reflects the venue\'s stated opening hours and any periods the venue has blocked.',
        'You will receive a confirmation code once your booking is confirmed. Bring it, or be prepared to identify yourself, when you arrive.',
      ],
    },
    {
      heading: '4. Prices, payment and fees',
      body: [
        'Prices are set by the venue and shown in Philippine Pesos before you pay. The price shown at checkout is the price you pay.',
        `AIR/Rally charges venues a platform fee of ${PLATFORM_FEE_DISPLAY} of the booking value. This fee is taken from the venue's share and is not added on top of the price you see.`,
        'Payments are processed by PayMongo, a licensed Philippine payment provider. AIR/Rally never receives or stores your card number, bank credentials or e-wallet credentials. AIR/Rally records only the payment reference identifiers PayMongo returns, so a booking can be matched to its payment.',
        'A booking is only treated as paid when PayMongo confirms the payment to AIR/Rally directly. A payment page that appears to succeed is not itself proof of payment.',
      ],
    },
    {
      heading: '5. Cancellations',
      body: [
        `If you cancel at least ${CANCELLATION_WINDOW} before your booking starts, you are eligible for compensation in AIR/Rally Credits. If you cancel inside that window, you are not.`,
        'If the venue cancels, if the court becomes unavailable, or if a system or payment error is at fault, you are compensated in full regardless of how close to the start time it happens, because none of that is your doing.',
        'Compensation is issued as AIR/Rally Credits rather than a return of funds to your original payment method.',
      ],
    },
    {
      heading: '6. Rescheduling',
      body: [
        `A confirmed booking may be rescheduled while its start time is more than ${RESCHEDULE_WINDOW} away, subject to the new slot being available.`,
        'If the new slot costs more, you pay the difference before the reschedule completes. A reschedule is only final once any additional payment succeeds.',
      ],
    },
    {
      heading: '7. AIR/Rally Credits',
      body: [
        'Credits are a balance held in your AIR/Rally account that can be applied against future bookings on the platform.',
        'Credits are not money, not legal tender, and not redeemable for cash. They cannot be transferred to another person or sold. They are issued at AIR/Rally\'s discretion, principally as compensation under the cancellation terms above.',
        'Credits are applied automatically at checkout and reduce the amount you pay. A confirmed booking that used any Credits cannot be cancelled or rescheduled, and those Credits are not returned. Credits are themselves issued as compensation when a booking is cancelled, so allowing a Credit-paid booking to be cancelled or rescheduled for further Credits would let a balance be held indefinitely while court time is repeatedly reserved and released.',
      ],
    },
    {
      heading: '8. Venue owners',
      body: [
        'Venue owners must be approved before listing. Listings are reviewed before they become visible to players, and AIR/Rally may suspend a listing.',
        'By listing, you confirm you are entitled to offer the courts for hire, that your descriptions, photographs, prices and opening hours are accurate, and that you will honour bookings made through the platform.',
        'You are responsible for the safety and lawful operation of your facility, including any permits, insurance and staffing that requires.',
        'Amounts owed to you for confirmed bookings are recorded against your venue as they are earned. AIR/Rally will notify you of the settlement process and timetable separately; automated payouts are not yet operating.',
      ],
    },
    {
      heading: '9. Open Play and shared costs',
      body: [
        'A player may book a court and invite others to join. The organiser is the person who books and pays for the court, and is the only person AIR/Rally charges.',
        'Splitting that cost between players is entirely a matter between those players. AIR/Rally does not collect, hold, transfer or guarantee any share, and takes no part in disputes about who owes whom.',
      ],
    },
    {
      heading: '10. Community content',
      body: [
        'COURT/Side posts, comments, club pages, event listings, reviews and uploaded photographs are created by users, not by AIR/Rally.',
        'You keep ownership of what you post. You grant AIR/Rally a non-exclusive, royalty-free licence to store, display and distribute it within the platform for the purpose of operating the service.',
        'Post only what you have the right to post. Do not post anything unlawful, harassing, hateful, sexually explicit, violent, deceptive, or that impersonates another person. Do not post other people\'s personal information.',
        'Reviews may only be written for bookings you actually made and completed.',
        'Content you upload as an image is stored in publicly readable storage. Anyone holding the direct link can view it, whether or not they have an AIR/Rally account. Do not upload anything you would not want to be publicly accessible.',
      ],
    },
    {
      heading: '11. Reports and moderation',
      body: [
        'You can report a post, comment, club, event or player. Reports are private: the person reported is not told who reported them.',
        'AIR/Rally may remove content, suspend accounts or refuse service where these terms are broken. A moderation record is kept even after the content it concerns is deleted.',
        'To keep the platform usable, limits apply to how frequently content can be created — posts and comments per hour, clubs and reports per day.',
      ],
    },
    {
      heading: '12. Suspension and closing your account',
      body: [
        'You may stop using AIR/Rally at any time.',
        'AIR/Rally may suspend or close an account that breaches these terms, that is used unlawfully, or where necessary to protect other users or the platform.',
        'Closing an account does not cancel confirmed bookings or extinguish amounts already owed either way.',
      ],
    },
    {
      heading: '13. Disclaimers',
      body: [
        'AIR/Rally provides the platform as it is. Availability, descriptions and photographs come from venues, and AIR/Rally does not warrant that they are complete or accurate.',
        'AIR/Rally does not inspect courts, does not supervise play, and is not responsible for injury, loss or damage arising from your use of a venue\'s facilities. Sport carries risk; you play at your own risk.',
        'AIR/Rally does not guarantee uninterrupted or error-free operation of the platform.',
      ],
    },
    {
      heading: '14. Limitation of liability',
      body: [
        'To the fullest extent Philippine law allows, AIR/Rally is not liable for indirect or consequential loss, or for loss of profit, arising from your use of the platform.',
        'Nothing in these terms limits liability that cannot lawfully be limited, including for death or personal injury caused by negligence, or for fraud.',
      ],
    },
    {
      heading: '15. Changes to these terms',
      body: [
        'These terms may change as the platform develops. The version you accepted is recorded against your account at signup.',
        'Material changes will be notified in the platform. Continuing to use AIR/Rally after a change takes effect means you accept the updated terms.',
      ],
    },
    {
      heading: '16. Governing law',
      body: [
        'These terms are governed by the laws of the Republic of the Philippines, and the courts of the Philippines have jurisdiction over any dispute.',
      ],
    },
    {
      heading: '17. Contact',
      body: [
        'Questions about these terms can be raised through the support page in your AIR/Rally account. Replies are delivered as in-app notifications.',
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  title: 'Privacy Policy',
  intro: [
    'This policy explains what personal information AIR/Rally collects when you use air-rally.com, why, who can see it, and what rights you have over it.',
    'It is written to reflect how the platform actually works today.',
  ],
  sections: [
    {
      heading: '1. Who is responsible for your information',
      body: [
        'AIR/Rally operates the platform and decides how your personal information is handled. It is the personal information controller for the purposes of the Data Privacy Act of 2012 (RA 10173).',
      ],
    },
    {
      heading: '2. What we collect',
      body: [
        'Account information: your first name, last name, email address, and — if you provide them — a display name, profile photograph and phone number. We also generate a referral code for your account.',
        'Booking information: the courts and times you book, the price, the status of the booking, your confirmation code, and any cancellation or rescheduling.',
        'Payment information: the reference identifiers PayMongo returns for a payment, the amount, and whether it succeeded. We do not receive or store your card number, bank credentials or e-wallet credentials.',
        'Content you create: reviews, COURT/Side posts and comments, clubs and events you create or join, photographs you upload, who you follow, and posts you like or reshare.',
        'Support and safety information: support messages you send, and reports you file about other users or content.',
        'Technical information: standard server and security logs generated when your browser contacts the service.',
      ],
    },
    {
      heading: '3. Why we use it',
      body: [
        'To create and secure your account, to take and confirm bookings, to process payment through PayMongo, to show your bookings and history back to you, and to notify you about activity that concerns you.',
        'To let venues fulfil the bookings you make with them.',
        'To operate community features, to moderate reported content, and to enforce the limits and rules in the User Agreement.',
        'To keep records required for accounting, dispute handling and legal compliance.',
      ],
    },
    {
      heading: '4. Who can see your information',
      body: [
        'Other players see your display name and profile photograph next to your posts, comments, reviews, club memberships and event attendance. They do not see your email address or phone number.',
        'A venue owner sees the display name of anyone who books their courts, together with the booking\'s time, court, status and value. This is how they know who is arriving.',
        'AIR/Rally administrators can see accounts, bookings, payments, reports and support messages in order to run the platform, resolve disputes and moderate content.',
        'Photographs you upload — profile, post, club and venue images — are stored in publicly readable storage. Anyone with the direct link can open them, including people without an AIR/Rally account and search engines that discover the link.',
        'Reports you file are not shown to the person you reported, and are not attributed to you anywhere they can see.',
      ],
    },
    {
      heading: '5. Service providers and where your information is held',
      body: [
        'Supabase provides the database, authentication and file storage that hold your information. The database is located in South Korea.',
        'Vercel provides the hosting that serves the site. Server functions run in South Korea.',
        'PayMongo processes payments. When you pay, you interact with PayMongo directly and provide payment credentials to them, not to AIR/Rally.',
        'Because these providers operate outside the Philippines, your personal information is transferred to and stored in another country.',
      ],
    },
    {
      heading: '6. How long we keep it',
      body: [
        'Account information is kept while your account exists.',
        'Booking and payment records are kept after a booking finishes, because they are financial and dispute records.',
        'Moderation records are kept even after the content they concern has been deleted. A report deliberately outlives the post it describes, so that a record of what was reported and what was decided is not erased along with the content.',
      ],
    },
    {
      heading: '7. Your rights',
      body: [
        'Under the Data Privacy Act of 2012 you have rights to be informed about how your information is used, to access it, to correct it, to object to its processing, to have it erased or blocked in certain circumstances, to obtain a copy in a portable form, and to be indemnified for damage caused by misuse.',
        'You can change your name, display name, photograph and phone number yourself in your account settings.',
        'For any other request, contact us through the support page. Self-service data export and account deletion are not yet available; requests are handled manually.',
        'If you believe your rights have been infringed, you may complain to the National Privacy Commission.',
      ],
    },
    {
      heading: '8. Location',
      body: [
        'If you allow it, your browser shares your approximate location so that venues can be sorted by distance from you. This is used for that search only and is not stored on our servers. You can refuse, and the rest of the platform still works.',
      ],
    },
    {
      heading: '9. Keeping information secure',
      body: [
        'Access to data is enforced in the database itself rather than only in the application, so that a request can only return the records the requesting account is entitled to see.',
        'Passwords are handled by Supabase authentication and are never visible to AIR/Rally.',
        'No system is perfectly secure. If a breach affects your personal information, we will act in accordance with the notification requirements of the Data Privacy Act.',
      ],
    },
    {
      heading: '10. Children',
      body: [
        'AIR/Rally is not intended for children. Accounts should be created by adults; a minor should use the platform only through a parent or guardian\'s account and with their supervision.',
      ],
    },
    {
      heading: '11. Changes to this policy',
      body: ['This policy may change as the platform develops. Material changes will be notified in the platform.'],
    },
    {
      heading: '12. Contact',
      body: [
        'Privacy questions and requests can be raised through the support page in your AIR/Rally account. Replies are delivered as in-app notifications.',
      ],
    },
  ],
};
