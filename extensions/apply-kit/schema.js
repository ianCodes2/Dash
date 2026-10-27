/* Apply Kit — shared profile schema.
   Loaded by the options page, popup, and injected content script. */
(() => {
  const yesNo = ["Yes", "No"];

  const sections = [
    {
      id: "personal",
      title: "Personal",
      subtitle: "The basics nearly every application asks for.",
      fields: [
        { key: "firstName", label: "First name", type: "text", autocomplete: "given-name", placeholder: "Jordan" },
        { key: "middleName", label: "Middle name", type: "text", autocomplete: "additional-name", placeholder: "Optional" },
        { key: "lastName", label: "Last name", type: "text", autocomplete: "family-name", placeholder: "Lee" },
        { key: "preferredName", label: "Preferred name", type: "text", autocomplete: "nickname", placeholder: "Optional" },
        { key: "pronouns", label: "Pronouns", type: "text", placeholder: "Optional" },
        { key: "email", label: "Email", type: "email", autocomplete: "email", placeholder: "you@example.com" },
        { key: "phone", label: "Phone", type: "tel", autocomplete: "tel", placeholder: "(555) 123-4567" },
        { key: "phoneCountry", label: "Country code", type: "tel", autocomplete: "tel-country-code", placeholder: "+1" },
        { key: "address1", label: "Address line 1", type: "text", autocomplete: "address-line1", placeholder: "123 Main St" },
        { key: "address2", label: "Address line 2", type: "text", autocomplete: "address-line2", placeholder: "Apt, suite, unit — optional" },
        { key: "city", label: "City", type: "text", autocomplete: "address-level2", placeholder: "Springfield" },
        { key: "state", label: "State / province", type: "text", autocomplete: "address-level1", placeholder: "IL" },
        { key: "postalCode", label: "ZIP / postal code", type: "text", autocomplete: "postal-code", placeholder: "62701" },
        { key: "country", label: "Country", type: "text", autocomplete: "country-name", placeholder: "United States" },
        { key: "linkedin", label: "LinkedIn URL", type: "url", autocomplete: "url", placeholder: "https://linkedin.com/in/…" },
        { key: "github", label: "GitHub URL", type: "url", placeholder: "https://github.com/…" },
        { key: "portfolio", label: "Portfolio / website", type: "url", autocomplete: "url", placeholder: "https://…" }
      ]
    },
    {
      id: "work",
      title: "Work",
      subtitle: "Your current role and the one before it.",
      fields: [
        { key: "currentCompany", label: "Current company", type: "text", autocomplete: "organization", placeholder: "Acme Inc." },
        { key: "currentTitle", label: "Current job title", type: "text", autocomplete: "organization-title", placeholder: "Product Designer" },
        { key: "currentStartDate", label: "Start date", type: "text", placeholder: "2023-04" },
        { key: "currentEndDate", label: "End date", type: "text", placeholder: "Present" },
        { key: "currentLocation", label: "Job location", type: "text", placeholder: "Chicago, IL / Remote" },
        { key: "currentDescription", label: "Role summary", type: "textarea", rows: 3, placeholder: "A sentence or two about what you do." },
        { key: "previousCompany", label: "Previous company", type: "text", placeholder: "Optional" },
        { key: "previousTitle", label: "Previous job title", type: "text", placeholder: "Optional" },
        { key: "previousStartDate", label: "Previous start date", type: "text", placeholder: "2020-01" },
        { key: "previousEndDate", label: "Previous end date", type: "text", placeholder: "2023-03" }
      ]
    },
    {
      id: "education",
      title: "Education",
      subtitle: "Your most recent or highest degree.",
      fields: [
        { key: "school", label: "School", type: "text", autocomplete: "organization", placeholder: "University of Illinois" },
        { key: "degree", label: "Degree", type: "text", placeholder: "B.S." },
        { key: "major", label: "Field of study", type: "text", placeholder: "Computer Science" },
        { key: "graduationDate", label: "Graduation date", type: "text", placeholder: "2020-05" },
        { key: "gpa", label: "GPA", type: "text", placeholder: "3.8 — optional" }
      ]
    },
    {
      id: "eligibility",
      title: "Eligibility",
      subtitle: "The yes/no questions that trip up autofill.",
      fields: [
        { key: "workAuthorization", label: "Authorized to work?", type: "select", options: yesNo },
        { key: "requireSponsorship", label: "Require visa sponsorship?", type: "select", options: yesNo },
        { key: "willingToRelocate", label: "Willing to relocate?", type: "select", options: yesNo },
        { key: "availableStartDate", label: "Available start date", type: "text", placeholder: "2 weeks from offer" },
        { key: "noticePeriod", label: "Notice period", type: "text", placeholder: "2 weeks" }
      ]
    },
    {
      id: "answers",
      title: "Answers",
      subtitle: "Reusable text for the open-ended boxes.",
      fields: [
        { key: "summary", label: "Professional summary", type: "textarea", rows: 4, placeholder: "A short paragraph about you." },
        { key: "coverLetter", label: "Cover letter", type: "textarea", rows: 7, placeholder: "Paste a reusable cover letter here." },
        { key: "whyCompany", label: "Why this company?", type: "textarea", rows: 4, placeholder: "A reusable answer you can edit before submitting." },
        { key: "strengths", label: "Strengths", type: "textarea", rows: 3, placeholder: "Optional" },
        { key: "weaknesses", label: "Weaknesses", type: "textarea", rows: 3, placeholder: "Optional" }
      ]
    },
    {
      id: "sensitive",
      title: "Sensitive",
      subtitle: "Stored locally. Auto-filled only while sensitive filling is enabled.",
      sensitive: true,
      fields: [
        { key: "dateOfBirth", label: "Date of birth", type: "date", autocomplete: "bday", sensitive: true },
        { key: "ssn", label: "Social Security number", type: "text", sensitive: true, placeholder: "Optional" },
        { key: "gender", label: "Gender", type: "text", sensitive: true, placeholder: "Optional" },
        { key: "raceEthnicity", label: "Race / ethnicity", type: "text", sensitive: true, placeholder: "Optional" },
        { key: "veteranStatus", label: "Veteran status", type: "text", sensitive: true, placeholder: "Optional" },
        { key: "disabilityStatus", label: "Disability status", type: "text", sensitive: true, placeholder: "Optional" },
        { key: "desiredSalary", label: "Desired salary", type: "text", sensitive: true, placeholder: "$120,000" },
        { key: "currentSalary", label: "Current salary", type: "text", sensitive: true, placeholder: "Optional" }
      ]
    }
  ];

  const allFields = sections.flatMap((section) =>
    section.fields.map((field) => ({
      ...field,
      section: section.id,
      sectionTitle: section.title,
      sensitive: Boolean(field.sensitive || section.sensitive)
    }))
  );

  const byKey = new Map(allFields.map((field) => [field.key, field]));

  function getEmptyProfile() {
    const profile = {};
    for (const field of allFields) profile[field.key] = "";
    return profile;
  }

  window.ApplyKitSchema = {
    version: 1,
    sections,
    fields: allFields,
    defaults: {
      onlyEmpty: true,
      fillSensitive: true
    },
    getEmptyProfile,
    getField(key) {
      return byKey.get(key) || null;
    },
    isSensitive(key) {
      return Boolean(byKey.get(key)?.sensitive);
    },
    labelFor(key) {
      return byKey.get(key)?.label || key;
    }
  };
})();
