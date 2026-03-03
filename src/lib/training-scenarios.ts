export interface ScenarioChoice {
  text: string;
  correct: boolean;
  explanation: string;
}

export interface ScenarioStep {
  situation: string;
  question: string;
  choices: ScenarioChoice[];
  /** Hint shown after wrong answer */
  hint?: string;
}

export interface TrainingScenario {
  id: string;
  title: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  category: string;
  description: string;
  /** Estimated minutes */
  duration: number;
  steps: ScenarioStep[];
  /** Summary shown after completion */
  debrief: string;
}

export const TRAINING_SCENARIOS: TrainingScenario[] = [
  {
    id: "brute-force-ssh",
    title: "SSH Brute Force Attack",
    difficulty: "beginner",
    category: "Intrusion Detection",
    description:
      "Your SOC dashboard alerts you to a spike in failed SSH login attempts from a single IP targeting multiple hosts. Walk through the triage and response process.",
    duration: 5,
    steps: [
      {
        situation:
          "SecOps dashboard shows 847 failed SSH attempts from IP 203.0.113.42 in the last 15 minutes, targeting 12 different hosts with usernames: root, admin, ubuntu, deploy.",
        question: "What is your first action?",
        choices: [
          { text: "Immediately block the IP at the firewall", correct: false, explanation: "Blocking is important but premature. You should first verify the alert is a true positive and check if any attempt succeeded — blocking alone doesn't address a potential compromise." },
          { text: "Verify the alert and check if any login succeeded from this IP", correct: true, explanation: "Correct. Always validate first. Check for any successful authentication from the attacker IP — if they got in, this escalates from brute force to active compromise." },
          { text: "Ignore it — brute force attempts are normal background noise", correct: false, explanation: "847 attempts in 15 minutes across 12 hosts is not background noise. This is a targeted attack that requires investigation." },
          { text: "Email the security team and wait for instructions", correct: false, explanation: "While communication is important, waiting passively during an active attack wastes critical response time. SOC analysts should begin triage immediately." },
        ],
        hint: "Think about what could go wrong if you act without full information.",
      },
      {
        situation:
          "You check the logs and find all 847 attempts failed. No successful logins from 203.0.113.42. However, you notice the IP is from a known bulletproof hosting provider.",
        question: "What should you do next?",
        choices: [
          { text: "Close the alert — no successful login means no incident", correct: false, explanation: "The attack is still active. Closing without containment means the attacker continues trying and may eventually succeed if a weak password exists." },
          { text: "Block the IP and check if other IPs from the same subnet are also attacking", correct: true, explanation: "Correct. Block the immediate threat, then check for distributed attacks from the same network range. Bulletproof hosting suggests a coordinated operation." },
          { text: "Reboot all 12 targeted servers", correct: false, explanation: "Rebooting is disruptive and unnecessary — no compromise occurred. This would cause an outage with no security benefit." },
          { text: "Change all root passwords across the infrastructure", correct: false, explanation: "While password hygiene is good, this is an overreaction for failed attempts. Focus on blocking the attacker and checking for distributed attacks." },
        ],
      },
      {
        situation:
          "After blocking 203.0.113.42, you discover 3 more IPs from the same /24 subnet are also sending SSH attempts, though at a lower rate (50-100 each).",
        question: "How do you handle the distributed attack?",
        choices: [
          { text: "Block each IP individually as they appear", correct: false, explanation: "Whack-a-mole is inefficient. The attacker can rotate through many IPs in the subnet. A broader block is more effective." },
          { text: "Block the entire /24 subnet and document the incident", correct: true, explanation: "Correct. When multiple IPs from the same subnet are attacking, blocking the /24 is appropriate. Document everything for the incident report and threat intelligence." },
          { text: "Disable SSH on all servers", correct: false, explanation: "This would lock out legitimate administrators and cause a major operational disruption. Proportional response is key." },
          { text: "Only monitor — they're all failing anyway", correct: false, explanation: "Active attacks should be contained, not just monitored. The attacker may find a weak credential or switch techniques." },
        ],
      },
    ],
    debrief:
      "You successfully handled an SSH brute force attack by following proper triage: verify → assess → contain → investigate scope. Key takeaways: always check for successful logins before closing, look for distributed attacks from the same network, and apply proportional containment (subnet block vs individual IPs).",
  },
  {
    id: "lateral-movement",
    title: "Detecting Lateral Movement",
    difficulty: "intermediate",
    category: "Threat Hunting",
    description:
      "A routine UBA review reveals unusual login patterns for a developer account. Investigate whether this is legitimate activity or an attacker moving laterally through your network.",
    duration: 7,
    steps: [
      {
        situation:
          "UBA flags user 'jchen' with an anomaly score of 8.7/10. The signals: logged in from 4 countries in 6 hours, accessed 8 servers (baseline: 2), and 30% of logins are outside business hours.",
        question: "How do you assess this alert?",
        choices: [
          { text: "It's probably a VPN — developers travel and use VPNs all the time", correct: false, explanation: "4 countries in 6 hours is physically impossible without VPN/proxy, but that itself is suspicious. Legitimate VPN use typically shows 1-2 exit nodes, not 4 countries. This warrants investigation." },
          { text: "Check if jchen has a travel request or VPN usage that explains the geo-anomaly", correct: true, explanation: "Correct. Correlate with HR/travel data and VPN logs before escalating. If there's no legitimate explanation, this is a strong indicator of compromised credentials." },
          { text: "Immediately disable jchen's account", correct: false, explanation: "Disabling without verification could disrupt a legitimate user. Gather context first — but be ready to disable quickly if compromise is confirmed." },
          { text: "Wait 24 hours to see if the pattern continues", correct: false, explanation: "With an anomaly score of 8.7 and multi-country access, waiting is too risky. If credentials are compromised, the attacker is actively operating." },
        ],
        hint: "Balance between disrupting a legitimate user and allowing an attacker to operate.",
      },
      {
        situation:
          "HR confirms jchen is in the office today — no travel. VPN logs show no VPN sessions for this user. The foreign logins used valid credentials with the correct SSH key.",
        question: "This is now a confirmed compromise. What's your priority?",
        choices: [
          { text: "Disable the account and revoke all SSH keys", correct: false, explanation: "Account disabling is needed, but your first priority should be understanding the blast radius. If you disable too early, you lose visibility into what the attacker is doing." },
          { text: "Determine the blast radius — what systems were accessed and what data was touched", correct: true, explanation: "Correct. Before containment, quickly map the scope: which 8 servers were accessed, what commands were run, was any data exfiltrated? This informs your containment strategy." },
          { text: "Call law enforcement immediately", correct: false, explanation: "Law enforcement may be needed later, but right now you need to understand scope and contain the threat. Involve legal/compliance first to determine if LE notification is required." },
          { text: "Wipe and reimage all 8 servers", correct: false, explanation: "Reimaging destroys forensic evidence and is premature. You need to preserve evidence and understand the full scope before remediation." },
        ],
      },
      {
        situation:
          "Investigation reveals: the attacker accessed 3 database servers and ran SELECT queries on customer tables. The SSH key was likely stolen from jchen's laptop via a phishing payload 2 days ago.",
        question: "What's the correct escalation path?",
        choices: [
          { text: "Handle it internally — contain, eradicate, recover", correct: false, explanation: "Customer data access triggers regulatory obligations. This cannot be handled purely as a technical incident." },
          { text: "Notify legal/compliance about potential data breach, contain the threat, and begin forensic preservation", correct: true, explanation: "Correct. Customer data access is a potential reportable breach. Legal must assess regulatory obligations (GDPR, CCPA, etc.) while you simultaneously contain the threat and preserve evidence with chain of custody." },
          { text: "Send a company-wide email warning about the phishing attack", correct: false, explanation: "Alerting the company is important but not the immediate priority. Contain first, then communicate — and coordinate messaging through legal/PR." },
          { text: "Focus on finding and removing the phishing payload from jchen's laptop", correct: false, explanation: "The laptop is the initial vector but the active threat is the attacker on your servers. Contain the server-side compromise first, then address the endpoint." },
        ],
      },
    ],
    debrief:
      "This scenario demonstrated lateral movement detection through UBA anomalies. Key lessons: geo-impossible travel is a strong compromise indicator, always correlate with HR/VPN data, map the blast radius before containment, and escalate to legal when customer data is involved. The attack chain was: phishing → credential theft → lateral movement → data access.",
  },
  {
    id: "ransomware-response",
    title: "Ransomware Incident Response",
    difficulty: "advanced",
    category: "Incident Response",
    description:
      "Multiple servers begin showing signs of file encryption. You must make rapid decisions to contain the ransomware, preserve evidence, and minimize business impact.",
    duration: 10,
    steps: [
      {
        situation:
          "At 02:47 AM, monitoring alerts fire: 3 production servers show 95%+ CPU usage, disk I/O is maxed, and files are being renamed with a .locked extension. A ransom note (README_RESTORE.txt) appears in /tmp.",
        question: "What is your immediate action?",
        choices: [
          { text: "Power off the affected servers immediately", correct: false, explanation: "Hard power-off destroys volatile memory evidence (encryption keys may be in RAM). Network isolation is preferred — it stops the spread while preserving forensic data." },
          { text: "Isolate the affected servers from the network but keep them running", correct: true, explanation: "Correct. Network isolation stops lateral spread and C2 communication while preserving volatile evidence in memory. Encryption keys or the ransomware process may still be in RAM." },
          { text: "Read the ransom note to understand the attacker's demands", correct: false, explanation: "Reading the note is informational but not your immediate priority. Containment must come first — every second the ransomware runs, more files are encrypted." },
          { text: "Start restoring from backups on the affected servers", correct: false, explanation: "Restoring while ransomware is still active means the restored files will also be encrypted. Contain first, then restore." },
        ],
        hint: "Think about what evidence exists only in volatile memory.",
      },
      {
        situation:
          "You've isolated the 3 servers. The ransomware process is still running but can't reach its C2 server. You notice the encryption started from a service account 'svc-backup' that has access to all servers.",
        question: "What's your next priority?",
        choices: [
          { text: "Kill the ransomware process on all 3 servers", correct: false, explanation: "Killing the process may trigger a dead-man switch or destroy the encryption key in memory. Capture memory first, then carefully terminate." },
          { text: "Disable the svc-backup account and check which other servers it has access to", correct: true, explanation: "Correct. The compromised service account is the attack vector. Disable it immediately to prevent the ransomware from spreading to other servers it can access. Then assess the full blast radius." },
          { text: "Contact the attacker to negotiate", correct: false, explanation: "Never contact attackers without legal counsel and executive approval. Focus on containment and recovery through backups." },
          { text: "Begin forensic imaging of the 3 servers", correct: false, explanation: "Forensic imaging is important but the immediate priority is stopping the spread. The svc-backup account may be encrypting other servers right now." },
        ],
      },
      {
        situation:
          "svc-backup is disabled. You discover it had access to 47 servers total. 3 are encrypted, 44 are untouched. Backups exist but the last full backup is 18 hours old. The ransomware binary is identified as a known variant with no public decryptor.",
        question: "How do you proceed with recovery?",
        choices: [
          { text: "Pay the ransom to get the decryption key — 18 hours of data loss is unacceptable", correct: false, explanation: "Paying ransoms funds criminal operations, doesn't guarantee decryption, and may violate sanctions laws. 18 hours of data loss is painful but recoverable." },
          { text: "Capture memory dumps from the 3 servers, then restore from backups on clean-rebuilt systems", correct: true, explanation: "Correct. Memory dumps may contain encryption keys (some ransomware variants keep them in RAM). Rebuild the 3 servers from scratch, restore from the 18-hour-old backup, and work with application teams to recover the gap from transaction logs or replicas." },
          { text: "Restore backups directly onto the encrypted servers", correct: false, explanation: "The servers are compromised — you must rebuild from scratch. Restoring onto a compromised system risks reinfection from persistence mechanisms." },
          { text: "Wait for a public decryptor to be released", correct: false, explanation: "There's no guarantee a decryptor will ever be released, and business operations can't wait indefinitely. Restore from backups." },
        ],
      },
      {
        situation:
          "Systems are being rebuilt. The investigation reveals the initial access was through a phishing email to an IT admin 5 days ago, which installed a RAT that eventually compromised svc-backup credentials.",
        question: "What post-incident actions are most critical?",
        choices: [
          { text: "Fire the IT admin who clicked the phishing email", correct: false, explanation: "Blame culture discourages incident reporting. The failure was systemic (service account with too-broad access, no MFA, no email filtering) — not individual." },
          { text: "Rotate all service account credentials, implement least-privilege access, and add MFA", correct: true, explanation: "Correct. Address the systemic issues: svc-backup had access to 47 servers (violates least privilege), service accounts lacked MFA, and the phishing email wasn't caught. These structural fixes prevent recurrence." },
          { text: "Install antivirus on all servers", correct: false, explanation: "AV alone wouldn't have prevented this — the RAT was likely custom/obfuscated. Defense in depth (MFA, least privilege, EDR, email filtering) is needed." },
          { text: "Block all email attachments company-wide", correct: false, explanation: "This is too disruptive to business operations. Better solutions: email sandboxing, attachment scanning, and security awareness training." },
        ],
      },
    ],
    debrief:
      "This ransomware scenario tested advanced IR skills: network isolation over power-off (preserve evidence), identifying the attack vector (compromised service account), proper recovery (rebuild + restore, never restore onto compromised systems), and systemic post-incident improvements. The full kill chain was: phishing → RAT → credential theft → lateral movement → ransomware deployment.",
  },
  {
    id: "insider-threat",
    title: "Insider Threat Investigation",
    difficulty: "intermediate",
    category: "User Behavior",
    description:
      "HR has flagged a departing employee who may be exfiltrating company data. Conduct a sensitive investigation while balancing privacy, legal requirements, and security.",
    duration: 7,
    steps: [
      {
        situation:
          "HR informs you that senior engineer 'mwilson' submitted their 2-week notice yesterday. Their manager reports mwilson has been 'acting differently' — working late hours and being secretive. HR requests you investigate.",
        question: "What's the proper first step?",
        choices: [
          { text: "Immediately start monitoring all of mwilson's activity", correct: false, explanation: "Surveillance without proper authorization can violate privacy laws and company policy. You need legal/HR approval and documented justification before monitoring." },
          { text: "Get written authorization from legal/HR, then review existing logs for anomalies", correct: true, explanation: "Correct. Always get documented authorization before investigating an employee. Then start with existing logs — you don't need new surveillance to check historical access patterns in SecOps and UBA." },
          { text: "Confront mwilson directly and ask what they're doing", correct: false, explanation: "Tipping off a potential insider threat causes them to accelerate exfiltration or cover their tracks. Investigations must be covert until evidence is gathered." },
          { text: "Disable mwilson's access as a precaution", correct: false, explanation: "Premature access removal tips off the subject and may be unjustified — 'acting differently' isn't evidence of wrongdoing. Investigate first." },
        ],
        hint: "Consider the legal and HR implications before taking technical action.",
      },
      {
        situation:
          "With legal authorization, you review UBA data. mwilson's anomaly score jumped to 7.2 this week. Signals: 3x normal data volume, accessing repos they haven't touched in months, and activity at 11 PM–2 AM (unusual for them).",
        question: "How do you interpret this data?",
        choices: [
          { text: "This confirms data theft — escalate to legal immediately", correct: false, explanation: "The data is suspicious but not conclusive. Accessing old repos could be knowledge transfer for their replacement. You need to determine what specifically was accessed and whether data left the network." },
          { text: "Investigate what specific data was accessed and check for any data leaving the network", correct: true, explanation: "Correct. Anomalous patterns warrant deeper investigation but aren't proof of theft. Check: what repos/files were accessed, were any large downloads or uploads detected, did data go to personal email/cloud storage?" },
          { text: "This is normal — departing employees often wrap up loose ends", correct: false, explanation: "While some increased activity is normal during offboarding, 3x data volume and accessing dormant repos at unusual hours is beyond normal wrap-up activity." },
          { text: "Install a keylogger on mwilson's workstation", correct: false, explanation: "Keyloggers are invasive, potentially illegal without explicit consent, and likely violate company policy. Use existing monitoring capabilities." },
        ],
      },
      {
        situation:
          "Deep dive reveals: mwilson cloned 4 proprietary repos to a personal USB drive (detected by endpoint DLP), and uploaded 2.3 GB to a personal Google Drive. The data includes customer lists and product roadmaps.",
        question: "What action do you take?",
        choices: [
          { text: "Disable all access immediately and involve legal for potential litigation", correct: true, explanation: "Correct. With concrete evidence of data exfiltration of proprietary and customer data, immediate access revocation is justified. Legal must assess trade secret theft, contractual violations, and potential regulatory implications for customer data." },
          { text: "Let them finish their 2 weeks and address it in the exit interview", correct: false, explanation: "Allowing continued access after confirmed exfiltration risks further data loss. Every day of access is more data potentially stolen." },
          { text: "Delete the Google Drive files remotely", correct: false, explanation: "You likely can't access their personal Google Drive, and attempting to do so may be illegal. Legal action is the proper path to recover stolen data." },
          { text: "Send mwilson a warning email about data handling policies", correct: false, explanation: "A warning tips them off and gives them time to hide evidence. With confirmed exfiltration, this is now a legal matter, not a policy reminder." },
        ],
      },
    ],
    debrief:
      "Insider threat investigations require balancing security with legal and privacy obligations. Key takeaways: always get authorization before investigating, use existing logs before deploying new monitoring, distinguish suspicious patterns from conclusive evidence, and involve legal when data theft is confirmed. The investigation chain was: HR tip → authorized log review → anomaly analysis → evidence of exfiltration → legal escalation.",
  },
  {
    id: "phishing-triage",
    title: "Phishing Email Triage",
    difficulty: "beginner",
    category: "Email Security",
    description:
      "An employee reports a suspicious email. Analyze the indicators, determine if it's a phishing attack, and respond appropriately to protect the organization.",
    duration: 5,
    steps: [
      {
        situation:
          "An employee forwards a suspicious email: From: 'IT-Support@yourcompany.co' (your real domain is yourcompany.com), Subject: 'Urgent: Password Expires in 2 Hours', with a link to 'https://yourcompany-login.evil.com/reset'.",
        question: "What indicators confirm this is phishing?",
        choices: [
          { text: "The urgency in the subject line is the main indicator", correct: false, explanation: "Urgency is one social engineering tactic, but it's not conclusive — legitimate IT emails can be urgent too. The domain spoofing (.co vs .com) and malicious link are stronger technical indicators." },
          { text: "The sender domain (.co vs .com), the malicious link domain, and the urgency combined", correct: true, explanation: "Correct. Multiple indicators together confirm phishing: lookalike sender domain (yourcompany.co), malicious link (yourcompany-login.evil.com), and urgency pressure. Any one alone might be benign, but together they're conclusive." },
          { text: "You can't tell from this information — you need to click the link to check", correct: false, explanation: "Never click links in suspected phishing emails. The domain mismatch and malicious URL are sufficient indicators without any interaction." },
          { text: "It's not phishing — the sender name says IT-Support", correct: false, explanation: "Sender display names are trivially spoofed. Always check the actual email address and domain, not just the display name." },
        ],
      },
      {
        situation:
          "Confirmed phishing. You check email logs and find this same email was sent to 142 employees in the last hour. 23 employees clicked the link. The link leads to a credential harvesting page.",
        question: "What's your immediate response?",
        choices: [
          { text: "Send a company-wide warning about the phishing email", correct: false, explanation: "Warning is needed but not the immediate priority. The 23 users who clicked may have entered credentials — those accounts need to be secured first." },
          { text: "Force password reset for the 23 users who clicked and check for compromised sessions", correct: true, explanation: "Correct. The 23 clickers may have submitted credentials. Force immediate password resets, revoke active sessions, and check if any of those accounts show post-compromise activity (unusual logins, forwarding rules, etc.)." },
          { text: "Block the sender email address", correct: false, explanation: "Blocking one sender address is trivial for attackers to bypass. Focus on the impacted users first, then implement broader email filtering rules." },
          { text: "Report the phishing domain to the registrar", correct: false, explanation: "Domain takedown is a good long-term action but takes days/weeks. Your immediate priority is the 23 potentially compromised accounts." },
        ],
      },
      {
        situation:
          "After resetting passwords for the 23 users, you find that 3 of them had their email forwarding rules changed to send all mail to an external address before you intervened.",
        question: "What does this indicate and what do you do?",
        choices: [
          { text: "It's a glitch — forwarding rules don't change from phishing", correct: false, explanation: "Forwarding rule manipulation is a classic post-compromise technique. The attacker used harvested credentials to set up persistent email access." },
          { text: "The attacker used stolen credentials to set up persistence — remove rules, audit those 3 accounts fully, and check for further compromise", correct: true, explanation: "Correct. Email forwarding is a persistence mechanism — even after password reset, the attacker receives copies of all emails. Remove the rules, audit all 3 accounts for other changes (delegates, app passwords, OAuth grants), and check if sensitive data was forwarded." },
          { text: "Just remove the forwarding rules and move on", correct: false, explanation: "Removing rules addresses one symptom but the attacker may have set up other persistence: OAuth app grants, app-specific passwords, email delegates. A full account audit is needed." },
          { text: "Disable email for all 142 targeted employees", correct: false, explanation: "Disabling email for 142 people is massively disruptive. Only the 3 compromised accounts need deep investigation. The other 20 clickers had passwords reset already." },
        ],
      },
    ],
    debrief:
      "This phishing scenario covered the full response lifecycle: identification (multiple indicators), scoping (142 targets, 23 clickers), containment (password resets), and persistence detection (forwarding rules). Key lesson: phishing response doesn't end at password reset — always check for post-compromise persistence mechanisms like forwarding rules, OAuth grants, and delegated access.",
  },
  {
    id: "cloud-misconfiguration",
    title: "Cloud Storage Exposure",
    difficulty: "advanced",
    category: "Cloud Security",
    description:
      "A threat intelligence feed reports that your organization's data has been found on a public paste site. Investigate the source, assess the damage, and remediate the exposure.",
    duration: 8,
    steps: [
      {
        situation:
          "A threat intel alert shows customer PII (names, emails, phone numbers) from your organization posted on a paste site 4 hours ago. The data appears to be a database export with ~10,000 records.",
        question: "What's your first action?",
        choices: [
          { text: "Request takedown of the paste site content", correct: false, explanation: "Takedown is important but not first priority. The data is already exposed and likely cached/copied. You need to find and close the source of the leak before more data is exposed." },
          { text: "Identify the source of the data leak — which system or storage was exposed", correct: true, explanation: "Correct. Finding the source is critical — the exposure may still be active. Match the data format and fields to your systems to identify which database or export this came from." },
          { text: "Notify all 10,000 affected customers immediately", correct: false, explanation: "Customer notification is legally required but premature at this stage. You need to understand the scope and source first. Legal/compliance will determine notification timing and content." },
          { text: "Check if any employee recently downloaded this data", correct: false, explanation: "While insider threat is possible, the most common cause of bulk data exposure is misconfigured cloud storage. Start with infrastructure before investigating individuals." },
        ],
        hint: "Think about what's still actively leaking vs. what's already leaked.",
      },
      {
        situation:
          "You trace the data format to a nightly analytics export. The export job writes to an S3 bucket. Checking the bucket policy, you find it was changed 3 days ago to allow public read access. CloudTrail shows the change was made by 'analytics-deploy' IAM role during a CI/CD pipeline run.",
        question: "How do you remediate?",
        choices: [
          { text: "Delete the S3 bucket entirely", correct: false, explanation: "Deleting the bucket destroys evidence and disrupts the analytics pipeline. Fix the access policy and preserve logs for investigation." },
          { text: "Revert the bucket policy to private, audit all buckets for similar misconfigurations, and review the CI/CD pipeline", correct: true, explanation: "Correct. Immediately close the exposure (revert to private), then check for systemic issues (other public buckets), and fix the root cause (CI/CD pipeline that can modify bucket policies without guardrails)." },
          { text: "Revoke the analytics-deploy IAM role", correct: false, explanation: "Revoking the role breaks the analytics pipeline. The role isn't malicious — the CI/CD pipeline had a misconfiguration. Fix the pipeline and add policy guardrails." },
          { text: "Enable S3 server-side encryption", correct: false, explanation: "Encryption at rest doesn't help when the bucket is publicly readable — anyone can download and decrypt. The access policy is the issue, not encryption." },
        ],
      },
      {
        situation:
          "The bucket is now private. You discover the CI/CD pipeline template was updated 3 days ago by a junior engineer who accidentally set the bucket ACL to public in a Terraform variable. No malicious intent.",
        question: "What preventive measures should you implement?",
        choices: [
          { text: "Remove the junior engineer's CI/CD access", correct: false, explanation: "Restricting one person doesn't fix the systemic issue. Any engineer could make the same mistake. Implement guardrails that prevent the misconfiguration regardless of who deploys." },
          { text: "Add S3 Block Public Access at the account level, require PR reviews for infra changes, and add policy-as-code scanning", correct: true, explanation: "Correct. Defense in depth: S3 Block Public Access prevents any bucket from being public (account-level guardrail), PR reviews catch misconfigurations before deploy, and policy-as-code (OPA/Checkov) automatically rejects insecure configurations in CI." },
          { text: "Add a monitoring alert for public S3 buckets", correct: false, explanation: "Monitoring detects but doesn't prevent. The bucket was public for 3 days before detection. Prevention (Block Public Access) is better than detection alone." },
          { text: "Switch from S3 to a different storage provider", correct: false, explanation: "Changing providers doesn't fix the process issue. Misconfigurations can happen on any cloud platform without proper guardrails." },
        ],
      },
      {
        situation:
          "Preventive controls are in place. Legal confirms this is a reportable breach under GDPR (EU customer data) and state breach notification laws. 10,000 customers are affected.",
        question: "What's the correct notification approach?",
        choices: [
          { text: "Post a notice on your website and hope customers see it", correct: false, explanation: "Passive notification doesn't meet GDPR or most state breach notification requirements. Direct individual notification is required." },
          { text: "Notify the supervisory authority within 72 hours and affected individuals without undue delay, with details on what happened and what you're doing about it", correct: true, explanation: "Correct. GDPR requires supervisory authority notification within 72 hours and individual notification without undue delay. Include: what data was exposed, the time period, remediation steps taken, and how individuals can protect themselves." },
          { text: "Wait until the investigation is fully complete before notifying anyone", correct: false, explanation: "GDPR's 72-hour clock starts when you become aware of the breach, not when the investigation concludes. Delayed notification can result in additional fines." },
          { text: "Only notify EU customers since GDPR only applies to them", correct: false, explanation: "State breach notification laws (CCPA, etc.) likely apply to US customers too. Legal should assess all applicable regulations, not just GDPR." },
        ],
      },
    ],
    debrief:
      "This cloud security scenario covered the full lifecycle of a data exposure incident: detection via threat intel, source identification (misconfigured S3 bucket), root cause analysis (CI/CD pipeline error), preventive controls (Block Public Access, policy-as-code), and regulatory compliance (GDPR notification). Key lesson: prevention beats detection — account-level guardrails like S3 Block Public Access would have prevented this entirely.",
  },
];

export const TRAINING_CATEGORIES = [
  ...new Set(TRAINING_SCENARIOS.map((s) => s.category)),
];
