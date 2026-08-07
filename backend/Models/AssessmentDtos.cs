namespace backend.Models;

public class AssessmentGenerateRequest
{
    public int HabitId { get; set; }
    /// <summary>Practice mode: quiz from group materials (HabitId may be 0).</summary>
    public int? GroupId { get; set; }
    public bool Practice { get; set; }
    /// <summary>Override difficulty for practice (otherwise habit/group default easy).</summary>
    public string? Difficulty { get; set; }
    public string? ApiKey { get; set; }
    public string? BaseUrl { get; set; }
    public string? Model { get; set; }
    public string Language { get; set; } = "zh";
    /// <summary>HabitMaterial ids to include.</summary>
    public List<int>? MaterialIds { get; set; }
    /// <summary>HabitGroupMaterial ids to include.</summary>
    public List<int>? GroupMaterialIds { get; set; }
}

public class AssessmentGradeRequest
{
    public int HabitId { get; set; }
    public int? GroupId { get; set; }
    public bool Practice { get; set; }
    public string Difficulty { get; set; } = "easy";
    public string? ApiKey { get; set; }
    public string? BaseUrl { get; set; }
    public string? Model { get; set; }
    public string Language { get; set; } = "zh";
    public List<AssessmentAnswerDto> Answers { get; set; } = new();
}

public class AssessmentAnswerDto
{
    public string QuestionId { get; set; } = string.Empty;
    public string Type { get; set; } = "mcq";
    public string? SelectedOptionId { get; set; }
    public string? TextAnswer { get; set; }
    /// <summary>Echo of question payload for grading (server trusts generate session lightly).</summary>
    public AssessmentQuestionDto? Question { get; set; }
}

public class AssessmentQuestionDto
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = "mcq";
    public string Prompt { get; set; } = string.Empty;
    public List<AssessmentOptionDto>? Options { get; set; }
    public string? CorrectOptionId { get; set; }
    public string? ReferenceAnswer { get; set; }
    public int MaxScore { get; set; } = 1;
}

public class AssessmentOptionDto
{
    public string Id { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
}

public class AssessmentHighlightDto
{
    public int Start { get; set; }
    public int End { get; set; }
    public string Reason { get; set; } = string.Empty;
}

public class AssessmentDeductionDto
{
    public string Reason { get; set; } = string.Empty;
    public int Points { get; set; }
}

public class AssessmentItemResultDto
{
    public string QuestionId { get; set; } = string.Empty;
    public bool Correct { get; set; }
    public double Score { get; set; }
    public double MaxScore { get; set; }
    public string Explanation { get; set; } = string.Empty;
    public string? CorrectOptionId { get; set; }
    public List<AssessmentHighlightDto> Highlights { get; set; } = new();
    public List<AssessmentDeductionDto> Deductions { get; set; } = new();
}
