import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays, subWeeks, subMonths, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";

interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangeFilterProps {
  value?: DateRange;
  onChange?: (range: DateRange) => void;
  className?: string;
}

export function DateRangeFilter({ value, onChange, className }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(value);

  const presetRanges = [
    {
      label: "Today",
      value: () => ({
        from: startOfDay(new Date()),
        to: endOfDay(new Date())
      })
    },
    {
      label: "Last 7 days",
      value: () => ({
        from: startOfDay(subDays(new Date(), 7)),
        to: endOfDay(new Date())
      })
    },
    {
      label: "Last 30 days",
      value: () => ({
        from: startOfDay(subDays(new Date(), 30)),
        to: endOfDay(new Date())
      })
    },
    {
      label: "Last 3 months",
      value: () => ({
        from: startOfDay(subMonths(new Date(), 3)),
        to: endOfDay(new Date())
      })
    },
    {
      label: "Last 6 months",
      value: () => ({
        from: startOfDay(subMonths(new Date(), 6)),
        to: endOfDay(new Date())
      })
    },
    {
      label: "Last year",
      value: () => ({
        from: startOfDay(subMonths(new Date(), 12)),
        to: endOfDay(new Date())
      })
    }
  ];

  const handlePresetSelect = (preset: string) => {
    const range = presetRanges.find(r => r.label === preset);
    if (range) {
      const newRange = range.value();
      setSelectedRange(newRange);
      onChange?.(newRange);
      setOpen(false);
    }
  };

  const handleCustomDateSelect = (date: Date | undefined) => {
    if (!date) return;
    
    if (!selectedRange?.from || (selectedRange.from && selectedRange.to)) {
      // Start new range
      const newRange = { from: startOfDay(date), to: endOfDay(date) };
      setSelectedRange(newRange);
    } else if (selectedRange.from && !selectedRange.to) {
      // Complete range
      const newRange = {
        from: selectedRange.from,
        to: date < selectedRange.from ? endOfDay(date) : endOfDay(date)
      };
      setSelectedRange(newRange);
      onChange?.(newRange);
      setOpen(false);
    }
  };

  const formatDateRange = (range?: DateRange) => {
    if (!range) return "Select date range";
    
    const { from, to } = range;
    const fromStr = format(from, "MMM dd, yyyy");
    const toStr = format(to, "MMM dd, yyyy");
    
    if (fromStr === toStr) {
      return fromStr;
    }
    
    return `${fromStr} - ${toStr}`;
  };

  const getCurrentPreset = () => {
    if (!selectedRange) return null;
    
    const preset = presetRanges.find(p => {
      const range = p.value();
      return format(range.from, "yyyy-MM-dd") === format(selectedRange.from, "yyyy-MM-dd") &&
             format(range.to, "yyyy-MM-dd") === format(selectedRange.to, "yyyy-MM-dd");
    });
    
    return preset?.label || "Custom";
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("justify-start text-left font-normal", className)}
        >
          <Calendar className="w-4 h-4 mr-2" />
          <span className="truncate max-w-[200px]">
            {formatDateRange(selectedRange)}
          </span>
          <ChevronDown className="w-4 h-4 ml-auto" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex">
          {/* Preset Options */}
          <div className="border-r w-40 p-2">
            <div className="text-sm font-medium mb-2 px-2">Quick Select</div>
            <div className="space-y-1">
              {presetRanges.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetSelect(preset.label)}
                  className={cn(
                    "w-full text-left px-2 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800",
                    getCurrentPreset() === preset.label && "bg-primary text-primary-foreground"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Calendar */}
          <div className="p-2">
            <CalendarComponent
              mode="single"
              selected={selectedRange?.from}
              onSelect={handleCustomDateSelect}
              className="rounded-md border-0"
            />
            
            {selectedRange && (
              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                <div className="font-medium">Selected Range:</div>
                <div className="text-gray-600 dark:text-gray-400">
                  {formatDateRange(selectedRange)}
                </div>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}